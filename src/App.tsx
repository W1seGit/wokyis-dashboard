import { useState, useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './App.css';

function App() {
  const [time, setTime] = useState(new Date());
  const [youtubeUrl, setYoutubeUrl] = useState(() => localStorage.getItem('youtubeUrl') || '');
  const [nowPlaying, setNowPlaying] = useState('');
  const [calendarEvent, setCalendarEvent] = useState('');
  const [weather, setWeather] = useState<{ temp: number; description: string; code: number } | null>(null);
  const [weatherError, setWeatherError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [lat, setLat] = useState<number | null>(() => {
    const v = localStorage.getItem('lat');
    return v ? parseFloat(v) : null;
  });
  const [lon, setLon] = useState<number | null>(() => {
    const v = localStorage.getItem('lon');
    return v ? parseFloat(v) : null;
  });
  const [locationCity, setLocationCity] = useState<string>('');
  const [locationRequested, setLocationRequested] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showTimer, setShowTimer] = useState(false);

  // Timer state
  const [timerSeconds, setTimerSeconds] = useState(() => {
    const v = localStorage.getItem('timerMinutes');
    return v ? parseInt(v) * 60 : 25 * 60;
  });
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerTotal, setTimerTotal] = useState(() => {
    const v = localStorage.getItem('timerMinutes');
    return v ? parseInt(v) * 60 : 25 * 60;
  });
  const endTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  // Extract video ID from URL
  const videoId = useMemo(() => {
    if (!youtubeUrl) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const p of patterns) {
      const m = youtubeUrl.match(p);
      if (m) return m[1];
    }
    return null;
  }, [youtubeUrl]);

  // Clock
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const formattedTime = useMemo(() => {
    const h = time.getHours().toString().padStart(2, '0');
    const m = time.getMinutes().toString().padStart(2, '0');
    const s = time.getSeconds().toString().padStart(2, '0');
    return { hours: h, minutes: m, seconds: s };
  }, [time]);

  const formattedDate = useMemo(() => {
    return time.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [time]);

  // Now Playing poll
  useEffect(() => {
    const fetchNowPlaying = async () => {
      try {
        const result: string = await invoke('get_now_playing');
        setNowPlaying(result);
      } catch {
        setNowPlaying('');
      }
    };
    fetchNowPlaying();
    const id = setInterval(fetchNowPlaying, 5000);
    return () => clearInterval(id);
  }, []);

  // Calendar event poll
  useEffect(() => {
    const fetchCalendar = async () => {
      try {
        const result: string = await invoke('get_next_calendar_event');
        setCalendarEvent(result);
      } catch {
        setCalendarEvent('');
      }
    };
    fetchCalendar();
    const id = setInterval(fetchCalendar, 30000);
    return () => clearInterval(id);
  }, []);

  // Request location explicitly
  const requestLocation = () => {
    setLocationRequested(true);
    setWeatherError('');
    if (!('geolocation' in navigator)) {
      setWeatherError('Geolocation not available');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLon(pos.coords.longitude);
        localStorage.setItem('lat', pos.coords.latitude.toString());
        localStorage.setItem('lon', pos.coords.longitude.toString());
      },
      (err) => {
        if (err.code === 1) setWeatherError('Location permission denied — check System Settings → Privacy → Location Services');
        else if (err.code === 2) setWeatherError('Location unavailable');
        else setWeatherError('Location request timed out');
      },
      { enableHighAccuracy: false, timeout: 15000 }
    );
  };

  // Auto-detect location on first load (only if not already set)
  useEffect(() => {
    if (lat !== null || lon !== null) return;
    if (!('geolocation' in navigator)) return;
    // Only try once on mount
    const id = setTimeout(() => {
      if (lat === null && lon === null && !locationRequested) {
        // Silent attempt — will succeed only if user has already granted
        // If denied, we show the button for explicit permission
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setLat(pos.coords.latitude);
            setLon(pos.coords.longitude);
            localStorage.setItem('lat', pos.coords.latitude.toString());
            localStorage.setItem('lon', pos.coords.longitude.toString());
          },
          () => {
            // Silent fail — user needs to use the button
          },
          { enableHighAccuracy: false, timeout: 5000 }
        );
      }
    }, 500);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reverse geocode to get city name
  useEffect(() => {
    if (lat === null || lon === null) return;
    const fetchCity = async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`
        );
        const data = await res.json();
        const name = data?.address?.city || data?.address?.town || data?.address?.village || data?.address?.state || data?.address?.country || '';
        setLocationCity(name);
      } catch {
        setLocationCity('');
      }
    };
    fetchCity();
  }, [lat, lon]);

  // Weather fetch
  useEffect(() => {
    if (lat === null || lon === null) return;
    const fetchWeather = async () => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
        );
        const data = await res.json();
        if (data.current_weather) {
          const code = data.current_weather.weathercode;
          const descriptions: Record<number, string> = {
            0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
            45: 'Fog', 48: 'Rime Fog', 51: 'Light Drizzle', 53: 'Moderate Drizzle',
            55: 'Dense Drizzle', 61: 'Slight Rain', 63: 'Moderate Rain', 65: 'Heavy Rain',
            71: 'Slight Snow', 73: 'Moderate Snow', 75: 'Heavy Snow', 80: 'Slight Showers',
            81: 'Moderate Showers', 82: 'Violent Showers', 95: 'Thunderstorm', 96: 'Hail', 99: 'Hail',
          };
          setWeather({
            temp: Math.round(data.current_weather.temperature),
            description: descriptions[code] || 'Unknown',
            code,
          });
        }
      } catch {
        setWeatherError('Weather fetch failed');
      }
    };
    fetchWeather();
    const id = setInterval(fetchWeather, 600000);
    return () => clearInterval(id);
  }, [lat, lon]);

  // Timer logic
  useEffect(() => {
    if (!timerRunning) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }

    endTimeRef.current = Date.now() + timerSeconds * 1000;

    timerIntervalRef.current = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTimeRef.current! - Date.now()) / 1000));
      setTimerSeconds(remaining);
      if (remaining <= 0) {
        setTimerRunning(false);
        endTimeRef.current = null;
      }
    }, 200);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [timerRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTimer = () => {
    if (!timerRunning && timerSeconds === 0) {
      setTimerSeconds(timerTotal);
    }
    setTimerRunning((r) => !r);
  };

  const resetTimer = () => {
    setTimerRunning(false);
    endTimeRef.current = null;
    setTimerSeconds(timerTotal);
  };

  const setPreset = (mins: number) => {
    setTimerRunning(false);
    endTimeRef.current = null;
    setTimerSeconds(mins * 60);
    setTimerTotal(mins * 60);
    localStorage.setItem('timerMinutes', mins.toString());
  };

  const formattedTimer = `${String(Math.floor(timerSeconds / 60)).padStart(2, '0')}:${String(timerSeconds % 60).padStart(2, '0')}`;

  const saveYoutube = () => {
    localStorage.setItem('youtubeUrl', youtubeUrl);
    setShowSettings(false);
  };

  // Open Google sign-in in system browser
  const openGoogleSignIn = async () => {
    try {
      await invoke('open_url', {
        url: 'https://accounts.google.com/signin'
      });
    } catch {
      // Fallback: open in webview
      window.open('https://accounts.google.com/signin', '_blank');
    }
  };

  const weatherIcon = (code: number) => {
    if (code === 0) return '☀️';
    if (code <= 2) return '🌤️';
    if (code === 3) return '☁️';
    if (code <= 48) return '🌫️';
    if (code <= 55) return '🌧️';
    if (code <= 65) return '🌧️';
    if (code <= 75) return '🌨️';
    if (code <= 82) return '🌦️';
    return '⛈️';
  };

  const toggleFocusMode = () => {
    setFocusMode((f) => !f);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSettings(false);
      if (e.metaKey || e.ctrlKey) {
        if (e.key === ',') {
          e.preventDefault();
          setShowSettings((s) => !s);
        }
        if (e.key === 'f') {
          e.preventDefault();
          toggleFocusMode();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`app ${focusMode ? 'focus-mode' : ''}`}>
      {/* YouTube Background */}
      {videoId && (
        <div className="video-bg">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&loop=1&controls=0&disablekb=1&modestbranding=1&playsinline=1&playlist=${videoId}&rel=0&showinfo=0&iv_load_policy=3&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
            allow="autoplay; encrypted-media"
            allowFullScreen={false}
            title="Background Video"
          />
          <div className="video-overlay" />
        </div>
      )}

      {/* No video fallback */}
      {!videoId && <div className="bg-gradient" />}

      {/* Main Content */}
      <div className="content">
        {/* Top Bar */}
        <div className="top-bar">
          <div className="top-left">
            {weather ? (
              <div className="weather-widget">
                <div className="weather-main">
                  <span className="weather-icon">{weatherIcon(weather.code)}</span>
                  <span className="weather-temp">{weather.temp}°C</span>
                  <span className="weather-desc">{weather.description}</span>
                </div>
                {locationCity && (
                  <div className="location-indicator">
                    <span className="location-pin">📍</span>
                    <span className="location-name">{locationCity}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="location-prompt">
                {locationRequested && weatherError ? (
                  <span className="location-error">{weatherError}</span>
                ) : lat === null ? (
                  <button className="location-btn" onClick={requestLocation}>
                    📍 Enable Location
                  </button>
                ) : (
                  <span className="dim-text">Loading weather...</span>
                )}
                {lat !== null && !locationCity && weather && (
                  <span className="location-coords dim-text">
                    {lat.toFixed(2)}, {lon?.toFixed(2)}
                  </span>
                )}
                {locationCity && (
                  <div className="location-indicator standalone">
                    <span className="location-pin">📍</span>
                    <span className="location-name">{locationCity}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="top-center">
            {calendarEvent && !focusMode && (
              <div className="calendar-widget">
                <span className="calendar-icon">📅</span>
                <span className="calendar-text">{calendarEvent}</span>
              </div>
            )}
          </div>

          <div className="top-right">
            <button
              className="icon-btn"
              onClick={toggleFocusMode}
              title="Toggle Focus Mode (⌘F)"
            >
              {focusMode ? '🧘' : '👁️'}
            </button>
            <button
              className="icon-btn"
              onClick={() => setShowSettings((s) => !s)}
              title="Settings (⌘,)"
            >
              ⚙️
            </button>
          </div>
        </div>

        {/* Center Clock */}
        <div className="clock-area">
          <div className="clock">
            <span className="clock-hours">{formattedTime.hours}</span>
            <span className="clock-sep">:</span>
            <span className="clock-minutes">{formattedTime.minutes}</span>
            <span className="clock-sep">:</span>
            <span className="clock-seconds">{formattedTime.seconds}</span>
          </div>
          <div className="date-text">{formattedDate}</div>
        </div>

        {/* Bottom Bar */}
        <div className="bottom-bar">
          <div className="bottom-left">
            {nowPlaying && !focusMode && (
              <div className="now-playing-widget">
                <span className="np-icon">🎵</span>
                <span className="np-text">{nowPlaying}</span>
              </div>
            )}
          </div>

          <div className="bottom-right">
            {showTimer && (
              <div className="timer-widget">
                <div className="timer-presets">
                  {[15, 25, 30, 45, 60].map((m) => (
                    <button
                      key={m}
                      className={`preset-btn ${Math.floor(timerTotal / 60) === m ? 'active' : ''}`}
                      onClick={() => setPreset(m)}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
                <div className="timer-display">
                  <span className="timer-icon">⏱️</span>
                  <span className="timer-text">{formattedTimer}</span>
                  <button className="timer-btn" onClick={toggleTimer}>
                    {timerRunning ? '⏸️' : '▶️'}
                  </button>
                  <button className="timer-btn" onClick={resetTimer}>
                    🔄
                  </button>
                </div>
              </div>
            )}
            <button
              className="icon-btn"
              onClick={() => setShowTimer((s) => !s)}
              title="Toggle Timer"
            >
              ⏱️
            </button>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Settings</h2>

            <div className="settings-field">
              <label>Google Account</label>
              <button className="google-btn" onClick={openGoogleSignIn}>
                <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </button>
              <p className="hint">Opens in your browser. Sign in to enable personalized YouTube backgrounds.</p>
            </div>

            <div className="settings-field">
              <label>YouTube Video URL</label>
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <p className="hint">Paste a YouTube link. Video plays muted on loop behind the dashboard.</p>
            </div>

            <div className="settings-field">
              <label>Weather Location</label>
              <div className="location-settings-row">
                <button className="location-detect-btn" onClick={requestLocation}>
                  📍 Detect Location
                </button>
                {lat !== null && lon !== null && (
                  <span className="location-detected">
                    {locationCity ? `${locationCity}` : `${lat.toFixed(2)}, ${lon.toFixed(2)}`}
                  </span>
                )}
              </div>
              <div className="coords-row">
                <input
                  type="number"
                  value={lat ?? ''}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) { setLat(v); localStorage.setItem('lat', v.toString()); }
                  }}
                  placeholder="Latitude"
                  step="0.01"
                />
                <input
                  type="number"
                  value={lon ?? ''}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) { setLon(v); localStorage.setItem('lon', v.toString()); }
                  }}
                  placeholder="Longitude"
                  step="0.01"
                />
              </div>
              <p className="hint">Auto-detected from your device. Override manually for any city.</p>
            </div>

            <div className="settings-actions">
              <button className="btn-primary" onClick={saveYoutube}>Save</button>
              <button className="btn-secondary" onClick={() => setShowSettings(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
