import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './App.css';

/* ---------- Inline SVG Icons ---------- */
const IconSettings = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
);

const IconFocus = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
);

const IconFocusOff = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/></svg>
);

const IconTimer = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);

const IconPlay = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
);

const IconPause = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
);

const IconReset = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
);

const IconLocation = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
);

const IconLock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
);

const IconMusic = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
);

const IconCalendar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
);

const IconSun = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;
const IconCloudSun = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M12 2v2"/><path d="M12 8v2"/><path d="M5 5l1.5 1.5"/><path d="M17.5 6.5L19 5"/></svg>;
const IconCloud = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>;
const IconFog = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15h16"/><path d="M4 9h16"/><path d="M4 12h16"/></svg>;
const IconDrizzle = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 19v2"/><path d="M8 13v2"/><path d="M16 19v2"/><path d="M16 13v2"/><path d="M12 21v2"/><path d="M12 15v2"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>;
const IconRain = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>;
const IconSnow = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="8" y1="20" x2="8.01" y2="20"/><line x1="12" y1="18" x2="12.01" y2="18"/><line x1="12" y1="22" x2="12.01" y2="22"/><line x1="16" y1="16" x2="16.01" y2="16"/><line x1="16" y1="20" x2="16.01" y2="20"/></svg>;
const IconStorm = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"/><path d="M13 11l-4 6h6l-4 6"/></svg>;

/* ---------- App ---------- */
function App() {
  const [time, setTime] = useState(new Date());
  const [youtubeUrl, setYoutubeUrl] = useState(() => localStorage.getItem('youtubeUrl') || '');
  const [nowPlaying, setNowPlaying] = useState('');
  const [calendarEvent, setCalendarEvent] = useState('');
  const [weather, setWeather] = useState<{ temp: number; description: string; code: number } | null>(null);
  const [weatherError, setWeatherError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [lat, setLat] = useState<number | null>(() => { const v = localStorage.getItem('lat'); return v ? parseFloat(v) : null; });
  const [lon, setLon] = useState<number | null>(() => { const v = localStorage.getItem('lon'); return v ? parseFloat(v) : null; });
  const [locationCity, setLocationCity] = useState('');
  const [locationRequested, setLocationRequested] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showTimer, setShowTimer] = useState(false);

  /* --- Clock format --- */
  const [use24Hour, setUse24Hour] = useState(() => localStorage.getItem('use24Hour') !== 'false');

  /* --- Auto-hide UI --- */
  const [autoHideEnabled, setAutoHideEnabled] = useState(() => localStorage.getItem('autoHideEnabled') === 'true');
  const [autoHideDelay, setAutoHideDelay] = useState(() => { const v = localStorage.getItem('autoHideDelay'); return v ? parseInt(v) : 5; });
  const [uiHidden, setUiHidden] = useState(false);
  const autoHideTimerRef = useRef<number | null>(null);

  /* --- Timer --- */
  const [timerSeconds, setTimerSeconds] = useState(() => { const v = localStorage.getItem('timerMinutes'); return v ? parseInt(v) * 60 : 25 * 60; });
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerTotal, setTimerTotal] = useState(() => { const v = localStorage.getItem('timerMinutes'); return v ? parseInt(v) * 60 : 25 * 60; });
  const endTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  const videoId = useMemo(() => {
    if (!youtubeUrl) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const p of patterns) { const m = youtubeUrl.match(p); if (m) return m[1]; }
    return null;
  }, [youtubeUrl]);

  useEffect(() => { const id = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(id); }, []);

  const formattedTime = useMemo(() => {
    let h: number;
    let ampm = '';
    if (use24Hour) {
      h = time.getHours();
    } else {
      h = time.getHours() % 12;
      h = h === 0 ? 12 : h;
      ampm = time.getHours() >= 12 ? ' PM' : ' AM';
    }
    const m = time.getMinutes().toString().padStart(2, '0');
    const s = time.getSeconds().toString().padStart(2, '0');
    return { hours: h.toString().padStart(use24Hour ? 2 : 0, '0'), minutes: m, seconds: s, ampm };
  }, [time, use24Hour]);

  const formattedDate = useMemo(() => time.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), [time]);

  /* --- Auto-hide logic --- */
  const resetAutoHide = useCallback(() => {
    setUiHidden(false);
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    if (autoHideEnabled && !showSettings) {
      autoHideTimerRef.current = window.setTimeout(() => setUiHidden(true), autoHideDelay * 1000);
    }
  }, [autoHideEnabled, autoHideDelay, showSettings]);

  useEffect(() => {
    if (!autoHideEnabled || showSettings) {
      setUiHidden(false);
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
      return;
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'];
    events.forEach(e => window.addEventListener(e, resetAutoHide));
    resetAutoHide();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetAutoHide));
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    };
  }, [resetAutoHide, autoHideEnabled, showSettings]);

  /* --- Now Playing --- */
  useEffect(() => {
    const fetchNowPlaying = async () => {
      try { const result: string = await invoke('get_now_playing'); setNowPlaying(result); } catch { setNowPlaying(''); }
    };
    fetchNowPlaying();
    const id = setInterval(fetchNowPlaying, 5000);
    return () => clearInterval(id);
  }, []);

  /* --- Calendar --- */
  useEffect(() => {
    const fetchCalendar = async () => {
      try { const result: string = await invoke('get_next_calendar_event'); setCalendarEvent(result); } catch { setCalendarEvent(''); }
    };
    fetchCalendar();
    const id = setInterval(fetchCalendar, 30000);
    return () => clearInterval(id);
  }, []);

  /* --- Location --- */
  const requestLocation = () => {
    setLocationRequested(true);
    setWeatherError('');
    if (!('geolocation' in navigator)) { setWeatherError('Geolocation not available'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude); setLon(pos.coords.longitude);
        localStorage.setItem('lat', pos.coords.latitude.toString());
        localStorage.setItem('lon', pos.coords.longitude.toString());
      },
      (err) => {
        if (err.code === 1) setWeatherError('location_denied');
        else if (err.code === 2) setWeatherError('Location unavailable');
        else setWeatherError('Location request timed out');
      },
      { enableHighAccuracy: false, timeout: 15000 }
    );
  };

  useEffect(() => {
    if (lat !== null || lon !== null) return;
    if (!('geolocation' in navigator)) return;
    const id = setTimeout(() => {
      if (lat === null && lon === null && !locationRequested) {
        navigator.geolocation.getCurrentPosition(
          (pos) => { setLat(pos.coords.latitude); setLon(pos.coords.longitude); localStorage.setItem('lat', pos.coords.latitude.toString()); localStorage.setItem('lon', pos.coords.longitude.toString()); },
          () => {},
          { enableHighAccuracy: false, timeout: 5000 }
        );
      }
    }, 500);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (lat === null || lon === null) return;
    const fetchCity = async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`);
        const data = await res.json();
        const name = data?.address?.city || data?.address?.town || data?.address?.village || data?.address?.state || '';
        setLocationCity(name);
      } catch { setLocationCity(''); }
    };
    fetchCity();
  }, [lat, lon]);

  useEffect(() => {
    if (lat === null || lon === null) return;
    const fetchWeather = async () => {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
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
          setWeather({ temp: Math.round(data.current_weather.temperature), description: descriptions[code] || 'Unknown', code });
        }
      } catch { setWeatherError('Weather fetch failed'); }
    };
    fetchWeather();
    const id = setInterval(fetchWeather, 600000);
    return () => clearInterval(id);
  }, [lat, lon]);

  /* --- Timer logic --- */
  useEffect(() => {
    if (!timerRunning) { if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; } return; }
    endTimeRef.current = Date.now() + timerSeconds * 1000;
    timerIntervalRef.current = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTimeRef.current! - Date.now()) / 1000));
      setTimerSeconds(remaining);
      if (remaining <= 0) { setTimerRunning(false); endTimeRef.current = null; }
    }, 200);
    return () => { if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; } };
  }, [timerRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTimer = () => { if (!timerRunning && timerSeconds === 0) setTimerSeconds(timerTotal); setTimerRunning((r) => !r); };
  const resetTimer = () => { setTimerRunning(false); endTimeRef.current = null; setTimerSeconds(timerTotal); };
  const setPreset = (mins: number) => { setTimerRunning(false); endTimeRef.current = null; setTimerSeconds(mins * 60); setTimerTotal(mins * 60); localStorage.setItem('timerMinutes', mins.toString()); };
  const formattedTimer = `${String(Math.floor(timerSeconds / 60)).padStart(2, '0')}:${String(timerSeconds % 60).padStart(2, '0')}`;

  const saveSettings = () => {
    localStorage.setItem('youtubeUrl', youtubeUrl);
    localStorage.setItem('use24Hour', use24Hour.toString());
    localStorage.setItem('autoHideEnabled', autoHideEnabled.toString());
    localStorage.setItem('autoHideDelay', autoHideDelay.toString());
    setShowSettings(false);
  };

  const openLocationSettings = async () => {
    try { await invoke('open_location_settings'); } catch {}
  };

  const WeatherIcon = ({ code }: { code: number }) => {
    if (code === 0) return <IconSun />;
    if (code <= 2) return <IconCloudSun />;
    if (code === 3) return <IconCloud />;
    if (code <= 48) return <IconFog />;
    if (code <= 55) return <IconDrizzle />;
    if (code <= 65) return <IconRain />;
    if (code <= 75) return <IconSnow />;
    if (code <= 82) return <IconRain />;
    return <IconStorm />;
  };

  const toggleFocusMode = () => setFocusMode((f) => !f);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSettings(false);
      if (e.metaKey || e.ctrlKey) {
        if (e.key === ',') { e.preventDefault(); setShowSettings((s) => !s); }
        if (e.key === 'f') { e.preventDefault(); toggleFocusMode(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`app ${focusMode ? 'focus-mode' : ''} ${uiHidden ? 'ui-hidden' : ''}`}>
      {videoId && (
        <div className="video-bg">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&loop=1&controls=0&disablekb=1&modestbranding=1&playsinline=1&playlist=${videoId}&rel=0&showinfo=0&iv_load_policy=3&enablejsapi=1`}
            allow="autoplay; encrypted-media"
            allowFullScreen={false}
            referrerPolicy="strict-origin-when-cross-origin"
            title="Background Video"
          />
          <div className="video-overlay" />
        </div>
      )}
      {!videoId && <div className="bg-gradient" />}

      <div className="content">
        {/* Top Bar */}
        <div className="top-bar">
          <div className="top-left">
            {weather ? (
              <div className="glass-panel weather-widget ui-hideable">
                <div className="weather-main">
                  <span className="weather-icon"><WeatherIcon code={weather.code} /></span>
                  <span className="weather-temp">{weather.temp}°C</span>
                  <span className="weather-desc">{weather.description}</span>
                </div>
                {locationCity && (
                  <div className="location-indicator">
                    <IconLocation />
                    <span className="location-name">{locationCity}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="location-prompt ui-hideable">
                {weatherError === 'location_denied' ? (
                  <div className="location-denied-block">
                    <span className="location-error">Location access denied</span>
                    <button className="location-settings-btn" onClick={openLocationSettings}>
                      <IconLock /> Open Location Settings
                    </button>
                  </div>
                ) : locationRequested && weatherError ? (
                  <span className="location-error-text">{weatherError}</span>
                ) : lat === null ? (
                  <button className="glass-btn location-btn" onClick={requestLocation}>
                    <IconLocation /> Enable Location
                  </button>
                ) : (
                  <span className="dim-text">Loading weather...</span>
                )}
              </div>
            )}
          </div>

          <div className="top-center">
            {calendarEvent && !focusMode && (
              <div className="glass-panel calendar-widget ui-hideable">
                <IconCalendar />
                <span className="calendar-text">{calendarEvent}</span>
              </div>
            )}
          </div>

          <div className="top-right ui-hideable">
            <button className="glass-icon-btn" onClick={toggleFocusMode} title="Toggle Focus Mode (⌘F)">
              {focusMode ? <IconFocusOff /> : <IconFocus />}
            </button>
            <button className="glass-icon-btn" onClick={() => setShowSettings((s) => !s)} title="Settings (⌘,)">
              <IconSettings />
            </button>
          </div>
        </div>

        {/* Clock */}
        <div className="clock-area">
          <div className="clock">
            <span className="clock-hours">{formattedTime.hours}</span>
            <span className="clock-sep">:</span>
            <span className="clock-minutes">{formattedTime.minutes}</span>
            <span className="clock-sep">:</span>
            <span className="clock-seconds">{formattedTime.seconds}</span>
            {!use24Hour && <span className="clock-ampm">{formattedTime.ampm}</span>}
          </div>
          <div className="date-text">{formattedDate}</div>
        </div>

        {/* Bottom Bar */}
        <div className="bottom-bar">
          <div className="bottom-left">
            {nowPlaying && !focusMode && (
              <div className="glass-panel now-playing-widget ui-hideable">
                <IconMusic />
                <span className="np-text">{nowPlaying}</span>
              </div>
            )}
          </div>

          <div className="bottom-right ui-hideable">
            {showTimer && (
              <div className="glass-panel timer-widget">
                <div className="timer-presets">
                  {[15, 25, 30, 45, 60].map((m) => (
                    <button key={m} className={`preset-btn ${Math.floor(timerTotal / 60) === m ? 'active' : ''}`} onClick={() => setPreset(m)}>
                      {m}m
                    </button>
                  ))}
                </div>
                <div className="timer-display">
                  <IconTimer />
                  <span className="timer-text">{formattedTimer}</span>
                  <button className="timer-btn" onClick={toggleTimer}>{timerRunning ? <IconPause /> : <IconPlay />}</button>
                  <button className="timer-btn" onClick={resetTimer}><IconReset /></button>
                </div>
              </div>
            )}
            <button className="glass-icon-btn" onClick={() => setShowTimer((s) => !s)} title="Toggle Timer">
              <IconTimer />
            </button>
          </div>
        </div>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Settings</h2>

            <div className="settings-field">
              <label>YouTube Background</label>
              <input type="text" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
              <p className="hint">Paste a YouTube link. Video plays muted on loop behind the dashboard.</p>
            </div>

            <div className="settings-field">
              <label>Clock Format</label>
              <div className="toggle-row">
                <button className={`toggle-btn ${use24Hour ? 'active' : ''}`} onClick={() => setUse24Hour(true)}>24-Hour</button>
                <button className={`toggle-btn ${!use24Hour ? 'active' : ''}`} onClick={() => setUse24Hour(false)}>12-Hour AM/PM</button>
              </div>
            </div>

            <div className="settings-field">
              <label>Auto-Hide UI</label>
              <div className="toggle-row">
                <button className={`toggle-btn ${autoHideEnabled ? 'active' : ''}`} onClick={() => setAutoHideEnabled(true)}>On</button>
                <button className={`toggle-btn ${!autoHideEnabled ? 'active' : ''}`} onClick={() => setAutoHideEnabled(false)}>Off</button>
              </div>
              {autoHideEnabled && (
                <div className="slider-row">
                  <span className="slider-label">Hide after</span>
                  <input
                    type="range"
                    min="3"
                    max="30"
                    value={autoHideDelay}
                    onChange={(e) => setAutoHideDelay(parseInt(e.target.value))}
                    className="slider"
                  />
                  <span className="slider-value">{autoHideDelay}s</span>
                </div>
              )}
              <p className="hint">When enabled, UI elements fade out after inactivity. Move mouse to reveal.</p>
            </div>

            <div className="settings-field">
              <label>Weather Location</label>
              <div className="location-settings-row">
                <button className="location-detect-btn" onClick={requestLocation}>
                  <IconLocation /> Detect Location
                </button>
                {lat !== null && lon !== null && (
                  <span className="location-detected">{locationCity || `${lat.toFixed(2)}, ${lon.toFixed(2)}`}</span>
                )}
              </div>
              <div className="coords-row">
                <input type="number" value={lat ?? ''} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) { setLat(v); localStorage.setItem('lat', v.toString()); } }} placeholder="Latitude" step="0.01" />
                <input type="number" value={lon ?? ''} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) { setLon(v); localStorage.setItem('lon', v.toString()); } }} placeholder="Longitude" step="0.01" />
              </div>
              <p className="hint">Auto-detected from your device. Override manually for any city.</p>
            </div>

            <div className="settings-actions">
              <button className="btn-primary" onClick={saveSettings}>Save</button>
              <button className="btn-secondary" onClick={() => setShowSettings(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
