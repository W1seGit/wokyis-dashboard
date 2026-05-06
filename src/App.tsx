import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './App.css';

/* ============================================================
   TYPES
   ============================================================ */

interface Theme {
  bgDeep: string;
  bgPrimary: string;
  bgSecondary: string;
  textPrimary: string;
  textSecondary: string;
  textDim: string;
  accent: string;
  accentHover: string;
  glassBg: string;
  glassBorder: string;
  panelBlur: number;
  clockSize: string;
  radius: number;
}

interface Preset {
  id: string;
  name: string;
  backgroundType: 'youtube' | 'image';
  youtubeUrl: string;
  youtubeEndTime: number | null;
  imageUrl: string;
  use24Hour: boolean;
  autoHideEnabled: boolean;
  autoHideDelay: number;
  lat: number | null;
  lon: number | null;
  city: string;
  theme: Theme;
}

/* ============================================================
   DEFAULTS
   ============================================================ */

const DEFAULT_THEME: Theme = {
  bgDeep: '#020617',
  bgPrimary: '#0F172A',
  bgSecondary: '#1E293B',
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textDim: '#64748B',
  accent: '#22C55E',
  accentHover: '#16A34A',
  glassBg: 'rgba(15, 23, 42, 0.45)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  panelBlur: 24,
  clockSize: 'clamp(5.5rem, 13vw, 9.5rem)',
  radius: 16,
};

const PRESETS_KEY = 'wokyis_presets';
const ACTIVE_PRESET_KEY = 'wokyis_active_preset';

function loadPresets(): Preset[] {
  try { const raw = localStorage.getItem(PRESETS_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function savePresets(presets: Preset[]) { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); }
function loadActivePreset(): string | null { return localStorage.getItem(ACTIVE_PRESET_KEY); }
function saveActivePreset(id: string | null) { if (id) localStorage.setItem(ACTIVE_PRESET_KEY, id); else localStorage.removeItem(ACTIVE_PRESET_KEY); }

function generateId() { return Math.random().toString(36).slice(2, 10); }

/* ============================================================
   ICONS
   ============================================================ */

const Ico = ({ d, w = 20 }: { d: string; w?: number }) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

const IconSettings = () => <Ico d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />;
const IconFocus = () => <Ico d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />;
const IconFocusOff = () => <Ico d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />;
const IconTimer = () => <Ico d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-14v4l3 3" />;
const IconPlay = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>;
const IconPause = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>;
const IconReset = () => <Ico d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" />;
const IconLocation = () => <Ico d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />;
const IconLock = () => <Ico d="M19 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2zm-7-7a5 5 0 0 1 5 5v3H7V9a5 5 0 0 1 5-5z" />;
const IconMusic = () => <Ico d="M9 18V5l12-2v13" />;
const IconCalendar = () => <Ico d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />;
const IconTrash = () => <Ico d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />;
const IconDownload = () => <Ico d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />;
const IconUpload = () => <Ico d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />;
const IconPlus = () => <Ico d="M12 5v14M5 12h14" />;
const IconSun = () => <Ico d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" />;
const IconCloudSun = () => <Ico d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9zM12 2v2m0 6v2m-7-5 1.5 1.5m12.5-1.5L19 5" />;
const IconCloud = () => <Ico d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" />;
const IconFog = () => <Ico d="M4 15h16M4 9h16M4 12h16" />;
const IconDrizzle = () => <Ico d="M8 19v2M8 13v2M16 19v2M16 13v2M12 21v2M12 15v2M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />;
const IconRain = () => <Ico d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9M16 14v6M8 14v6M12 16v6" />;
const IconSnow = () => <Ico d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25M8 16h.01M8 20h.01M12 18h.01M12 22h.01M16 16h.01M16 20h.01" />;
const IconStorm = () => <Ico d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9M13 11l-4 6h6l-4 6" />;
const IconImage = () => <Ico d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14l4-4 5 5 6-6 3 3z" />;
const IconYoutube = () => <Ico d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.94 2C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" />;

/* ============================================================
   APP
   ============================================================ */

function App() {
  /* --- time --- */
  const [time, setTime] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(id); }, []);

  /* --- presets --- */
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [activePresetId, setActivePresetId] = useState<string | null>(loadActivePreset);

  /* --- background --- */
  const [backgroundType, setBackgroundType] = useState<'youtube' | 'image'>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeEndTime, setYoutubeEndTime] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState('');

  /* --- clock --- */
  const [use24Hour, setUse24Hour] = useState(true);

  /* --- auto-hide --- */
  const [autoHideEnabled, setAutoHideEnabled] = useState(false);
  const [autoHideDelay, setAutoHideDelay] = useState(5);
  const [uiHidden, setUiHidden] = useState(false);
  const autoHideTimerRef = useRef<number | null>(null);

  /* --- weather / location --- */
  const [weather, setWeather] = useState<{ temp: number; description: string; code: number } | null>(null);
  const [weatherError, setWeatherError] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [locationCity, setLocationCity] = useState('');
  const [manualCity, setManualCity] = useState('');
  const [locationRequested, setLocationRequested] = useState(false);

  /* --- now playing / calendar --- */
  const [nowPlaying, setNowPlaying] = useState('');
  const [calendarEvent, setCalendarEvent] = useState('');

  /* --- timer --- */
  const [timerSeconds, setTimerSeconds] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerTotal, setTimerTotal] = useState(25 * 60);
  const [showTimer, setShowTimer] = useState(false);
  const endTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  /* --- focus mode --- */
  const [focusMode, setFocusMode] = useState(false);

  /* --- settings modal --- */
  const [showSettings, setShowSettings] = useState(false);

  /* --- theme --- */
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  /* ==========================================================
     PERSISTENCE: load from localStorage on mount
     ========================================================== */
  useEffect(() => {
    setBackgroundType((localStorage.getItem('backgroundType') as 'youtube' | 'image') || 'youtube');
    setYoutubeUrl(localStorage.getItem('youtubeUrl') || '');
    const et = localStorage.getItem('youtubeEndTime');
    setYoutubeEndTime(et ? parseInt(et) : null);
    setImageUrl(localStorage.getItem('imageUrl') || '');
    setUse24Hour(localStorage.getItem('use24Hour') !== 'false');
    setAutoHideEnabled(localStorage.getItem('autoHideEnabled') === 'true');
    const ahd = localStorage.getItem('autoHideDelay');
    setAutoHideDelay(ahd ? parseInt(ahd) : 5);
    setLat((() => { const v = localStorage.getItem('lat'); return v ? parseFloat(v) : null; })());
    setLon((() => { const v = localStorage.getItem('lon'); return v ? parseFloat(v) : null; })());
    setLocationCity(localStorage.getItem('locationCity') || '');
    const ts = localStorage.getItem('timerSeconds');
    const tt = localStorage.getItem('timerTotal');
    if (ts) setTimerSeconds(parseInt(ts));
    if (tt) setTimerTotal(parseInt(tt));
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) { try { setTheme(JSON.parse(savedTheme)); } catch {} }
  }, []);

  /* ==========================================================
     THEME: apply CSS custom properties
     ========================================================== */
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--bg-deep', theme.bgDeep);
    r.style.setProperty('--bg-primary', theme.bgPrimary);
    r.style.setProperty('--bg-secondary', theme.bgSecondary);
    r.style.setProperty('--text-primary', theme.textPrimary);
    r.style.setProperty('--text-secondary', theme.textSecondary);
    r.style.setProperty('--text-dim', theme.textDim);
    r.style.setProperty('--accent', theme.accent);
    r.style.setProperty('--accent-hover', theme.accentHover);
    r.style.setProperty('--glass-bg', theme.glassBg);
    r.style.setProperty('--glass-border', theme.glassBorder);
    r.style.setProperty('--panel-blur', `${theme.panelBlur}px`);
    r.style.setProperty('--clock-size', theme.clockSize);
    r.style.setProperty('--radius', `${theme.radius}px`);
  }, [theme]);

  /* ==========================================================
     CLOCK FORMAT
     ========================================================== */
  const formattedTime = useMemo(() => {
    let h: number;
    let ampm = '';
    if (use24Hour) { h = time.getHours(); }
    else { h = time.getHours() % 12; h = h === 0 ? 12 : h; ampm = time.getHours() >= 12 ? ' PM' : ' AM'; }
    const m = time.getMinutes().toString().padStart(2, '0');
    const s = time.getSeconds().toString().padStart(2, '0');
    return { hours: h.toString().padStart(use24Hour ? 2 : 0, '0'), minutes: m, seconds: s, ampm };
  }, [time, use24Hour]);

  const formattedDate = useMemo(() => time.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), [time]);

  /* ==========================================================
     YOUTUBE / IMAGE SRC
     ========================================================== */
  const videoId = useMemo(() => {
    if (!youtubeUrl) return null;
    const m = youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }, [youtubeUrl]);

  const youtubeSrc = useMemo(() => {
    if (!videoId) return null;
    let url = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&loop=1&controls=0&disablekb=1&modestbranding=1&playsinline=1&playlist=${videoId}&rel=0&showinfo=0&iv_load_policy=3&enablejsapi=1`;
    if (youtubeEndTime && youtubeEndTime > 0) url += `&end=${youtubeEndTime}`;
    return url;
  }, [videoId, youtubeEndTime]);

  /* ==========================================================
     AUTO-HIDE
     ========================================================== */
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
    return () => { events.forEach(e => window.removeEventListener(e, resetAutoHide)); if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current); };
  }, [resetAutoHide, autoHideEnabled, showSettings]);

  /* ==========================================================
     NOW PLAYING
     ========================================================== */
  useEffect(() => {
    const fetchNP = async () => { try { const r: string = await invoke('get_now_playing'); setNowPlaying(r); } catch { setNowPlaying(''); } };
    fetchNP();
    const id = setInterval(fetchNP, 5000);
    return () => clearInterval(id);
  }, []);

  /* ==========================================================
     CALENDAR
     ========================================================== */
  useEffect(() => {
    const fetchCal = async () => { try { const r: string = await invoke('get_next_calendar_event'); setCalendarEvent(r); } catch { setCalendarEvent(''); } };
    fetchCal();
    const id = setInterval(fetchCal, 30000);
    return () => clearInterval(id);
  }, []);

  /* ==========================================================
     TIMER
     ========================================================== */
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
  const setPresetMins = (mins: number) => { setTimerRunning(false); endTimeRef.current = null; setTimerSeconds(mins * 60); setTimerTotal(mins * 60); localStorage.setItem('timerTotal', (mins * 60).toString()); };
  const formattedTimer = `${String(Math.floor(timerSeconds / 60)).padStart(2, '0')}:${String(timerSeconds % 60).padStart(2, '0')}`;

  /* ==========================================================
     WEATHER
     ========================================================== */
  const fetchWeather = useCallback(async (latitude: number, longitude: number) => {
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
      const data = await res.json();
      if (data.current_weather) {
        const code = data.current_weather.weathercode;
        const desc: Record<number, string> = {
          0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
          45: 'Fog', 48: 'Rime Fog', 51: 'Light Drizzle', 53: 'Moderate Drizzle',
          55: 'Dense Drizzle', 61: 'Slight Rain', 63: 'Moderate Rain', 65: 'Heavy Rain',
          71: 'Slight Snow', 73: 'Moderate Snow', 75: 'Heavy Snow', 80: 'Slight Showers',
          81: 'Moderate Showers', 82: 'Violent Showers', 95: 'Thunderstorm', 96: 'Hail', 99: 'Hail',
        };
        setWeather({ temp: Math.round(data.current_weather.temperature), description: desc[code] || 'Unknown', code });
      }
    } catch { setWeatherError('Weather fetch failed'); }
  }, []);

  useEffect(() => {
    if (lat === null || lon === null) return;
    fetchWeather(lat, lon);
    const id = setInterval(() => { if (lat !== null && lon !== null) fetchWeather(lat, lon); }, 600000);
    return () => clearInterval(id);
  }, [lat, lon, fetchWeather]);

  /* ==========================================================
     LOCATION
     ========================================================== */
  const requestLocation = () => {
    setLocationRequested(true);
    setWeatherError('');
    if (!('geolocation' in navigator)) { setWeatherError('Geolocation not available'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude); setLon(pos.coords.longitude);
        localStorage.setItem('lat', pos.coords.latitude.toString());
        localStorage.setItem('lon', pos.coords.longitude.toString());
        fetchCityName(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        if (err.code === 1) setWeatherError('location_denied');
        else if (err.code === 2) setWeatherError('Location unavailable');
        else setWeatherError('Location request timed out');
      },
      { enableHighAccuracy: false, timeout: 15000 }
    );
  };

  const fetchCityName = async (latitude: number, longitude: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10`);
      const data = await res.json();
      const name = data?.address?.city || data?.address?.town || data?.address?.village || data?.address?.state || '';
      setLocationCity(name);
      localStorage.setItem('locationCity', name);
    } catch { setLocationCity(''); }
  };

  const searchCity = async () => {
    if (!manualCity.trim()) return;
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(manualCity)}&count=1`);
      const data = await res.json();
      if (data.results && data.results[0]) {
        const r = data.results[0];
        setLat(r.latitude); setLon(r.longitude); setLocationCity(r.name);
        localStorage.setItem('lat', r.latitude.toString());
        localStorage.setItem('lon', r.longitude.toString());
        localStorage.setItem('locationCity', r.name);
        setWeatherError('');
      } else {
        setWeatherError('City not found');
      }
    } catch { setWeatherError('City search failed'); }
  };

  useEffect(() => {
    if (lat !== null || lon !== null) return;
    if (!('geolocation' in navigator)) return;
    const id = setTimeout(() => {
      if (lat === null && lon === null && !locationRequested) {
        navigator.geolocation.getCurrentPosition(
          (pos) => { setLat(pos.coords.latitude); setLon(pos.coords.longitude); localStorage.setItem('lat', pos.coords.latitude.toString()); localStorage.setItem('lon', pos.coords.longitude.toString()); fetchCityName(pos.coords.latitude, pos.coords.longitude); },
          () => {},
          { enableHighAccuracy: false, timeout: 5000 }
        );
      }
    }, 500);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ==========================================================
     PRESET MANAGEMENT
     ========================================================== */
  const buildCurrentPreset = (name: string): Preset => ({
    id: generateId(),
    name,
    backgroundType,
    youtubeUrl,
    youtubeEndTime,
    imageUrl,
    use24Hour,
    autoHideEnabled,
    autoHideDelay,
    lat,
    lon,
    city: locationCity,
    theme,
  });

  const applyPreset = (preset: Preset) => {
    setBackgroundType(preset.backgroundType);
    setYoutubeUrl(preset.youtubeUrl);
    setYoutubeEndTime(preset.youtubeEndTime);
    setImageUrl(preset.imageUrl);
    setUse24Hour(preset.use24Hour);
    setAutoHideEnabled(preset.autoHideEnabled);
    setAutoHideDelay(preset.autoHideDelay);
    setLat(preset.lat); setLon(preset.lon);
    setLocationCity(preset.city);
    setTheme(preset.theme);
    setActivePresetId(preset.id);
    saveActivePreset(preset.id);
    // persist individual fields too
    localStorage.setItem('backgroundType', preset.backgroundType);
    localStorage.setItem('youtubeUrl', preset.youtubeUrl);
    localStorage.setItem('youtubeEndTime', preset.youtubeEndTime?.toString() || '');
    localStorage.setItem('imageUrl', preset.imageUrl);
    localStorage.setItem('use24Hour', preset.use24Hour.toString());
    localStorage.setItem('autoHideEnabled', preset.autoHideEnabled.toString());
    localStorage.setItem('autoHideDelay', preset.autoHideDelay.toString());
    if (preset.lat) localStorage.setItem('lat', preset.lat.toString());
    if (preset.lon) localStorage.setItem('lon', preset.lon.toString());
    localStorage.setItem('locationCity', preset.city);
    localStorage.setItem('theme', JSON.stringify(preset.theme));
  };

  const saveCurrentAsPreset = () => {
    const name = prompt('Preset name:');
    if (!name || !name.trim()) return;
    const preset = buildCurrentPreset(name.trim());
    const next = [...presets, preset];
    setPresets(next);
    savePresets(next);
    setActivePresetId(preset.id);
    saveActivePreset(preset.id);
  };

  const deletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    savePresets(next);
    if (activePresetId === id) { setActivePresetId(null); saveActivePreset(null); }
  };

  const exportPresets = () => {
    const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wokyis-presets.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importPresets = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result as string) as Preset[];
        if (!Array.isArray(imported)) throw new Error('Invalid format');
        const next = [...presets, ...imported.map((p) => ({ ...p, id: generateId() }))];
        setPresets(next);
        savePresets(next);
      } catch { alert('Invalid preset file'); }
    };
    reader.readAsText(file);
  };

  /* ==========================================================
     SAVE SETTINGS
     ========================================================== */
  const saveSettings = () => {
    localStorage.setItem('backgroundType', backgroundType);
    localStorage.setItem('youtubeUrl', youtubeUrl);
    localStorage.setItem('youtubeEndTime', youtubeEndTime?.toString() || '');
    localStorage.setItem('imageUrl', imageUrl);
    localStorage.setItem('use24Hour', use24Hour.toString());
    localStorage.setItem('autoHideEnabled', autoHideEnabled.toString());
    localStorage.setItem('autoHideDelay', autoHideDelay.toString());
    localStorage.setItem('theme', JSON.stringify(theme));
    if (lat) localStorage.setItem('lat', lat.toString());
    if (lon) localStorage.setItem('lon', lon.toString());
    localStorage.setItem('locationCity', locationCity);
    setShowSettings(false);
  };

  const openLocationSettings = async () => { try { await invoke('open_location_settings'); } catch {} };

  /* ==========================================================
     KEYBOARD SHORTCUTS
     ========================================================== */
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

  /* ==========================================================
     WEATHER ICON
     ========================================================== */
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

  /* ==========================================================
     RENDER
     ========================================================== */
  return (
    <div className={`app ${focusMode ? 'focus-mode' : ''} ${uiHidden ? 'ui-hidden' : ''}`}>
      {/* Background */}
      {backgroundType === 'youtube' && youtubeSrc && (
        <div className="video-bg">
          <iframe src={youtubeSrc} allow="autoplay; encrypted-media" allowFullScreen={false} referrerPolicy="strict-origin-when-cross-origin" title="Background Video" />
          <div className="video-overlay" />
        </div>
      )}
      {backgroundType === 'image' && imageUrl && (
        <div className="image-bg-wrapper">
          <img src={imageUrl} className="image-bg" alt="" onError={() => setImageUrl('')} />
          <div className="video-overlay" />
        </div>
      )}
      {((backgroundType === 'youtube' && !youtubeSrc) || (backgroundType === 'image' && !imageUrl)) && <div className="bg-gradient" />}

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
                    <button key={m} className={`preset-btn ${Math.floor(timerTotal / 60) === m ? 'active' : ''}`} onClick={() => setPresetMins(m)}>{m}m</button>
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

      {/* Settings Modal */}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Settings</h2>

            {/* Presets */}
            <div className="settings-field">
              <label>Presets</label>
              <div className="preset-list">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    className={`preset-chip ${activePresetId === p.id ? 'active' : ''}`}
                    onClick={() => applyPreset(p)}
                  >
                    {p.name}
                    <span className="preset-delete" onClick={(e) => deletePreset(p.id, e)}><IconTrash /></span>
                  </button>
                ))}
                <button className="preset-chip add" onClick={saveCurrentAsPreset}><IconPlus /> New</button>
              </div>
              <div className="preset-actions">
                <button className="icon-text-btn" onClick={exportPresets}><IconDownload /> Export</button>
                <label className="icon-text-btn file-label">
                  <IconUpload /> Import
                  <input type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.[0]) importPresets(e.target.files[0]); }} />
                </label>
              </div>
            </div>

            {/* Background */}
            <div className="settings-field">
              <label>Background</label>
              <div className="toggle-row">
                <button className={`toggle-btn ${backgroundType === 'youtube' ? 'active' : ''}`} onClick={() => setBackgroundType('youtube')}><IconYoutube /> YouTube</button>
                <button className={`toggle-btn ${backgroundType === 'image' ? 'active' : ''}`} onClick={() => setBackgroundType('image')}><IconImage /> Image</button>
              </div>
              {backgroundType === 'youtube' && (
                <>
                  <input type="text" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
                  <div className="endtime-row">
                    <span className="hint">End time (seconds) — loop before video ends:</span>
                    <input type="number" min="1" value={youtubeEndTime || ''} onChange={(e) => { const v = parseInt(e.target.value); setYoutubeEndTime(isNaN(v) || v <= 0 ? null : v); }} placeholder="e.g. 120" className="endtime-input" />
                  </div>
                </>
              )}
              {backgroundType === 'image' && (
                <input type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://example.com/image.jpg" />
              )}
            </div>

            {/* Clock */}
            <div className="settings-field">
              <label>Clock Format</label>
              <div className="toggle-row">
                <button className={`toggle-btn ${use24Hour ? 'active' : ''}`} onClick={() => setUse24Hour(true)}>24-Hour</button>
                <button className={`toggle-btn ${!use24Hour ? 'active' : ''}`} onClick={() => setUse24Hour(false)}>12-Hour AM/PM</button>
              </div>
            </div>

            {/* Auto-Hide */}
            <div className="settings-field">
              <label>Auto-Hide UI</label>
              <div className="toggle-row">
                <button className={`toggle-btn ${autoHideEnabled ? 'active' : ''}`} onClick={() => setAutoHideEnabled(true)}>On</button>
                <button className={`toggle-btn ${!autoHideEnabled ? 'active' : ''}`} onClick={() => setAutoHideEnabled(false)}>Off</button>
              </div>
              {autoHideEnabled && (
                <div className="slider-row">
                  <span className="slider-label">Hide after</span>
                  <input type="range" min="3" max="60" value={autoHideDelay} onChange={(e) => setAutoHideDelay(parseInt(e.target.value))} className="slider" />
                  <span className="slider-value">{autoHideDelay}s</span>
                </div>
              )}
            </div>

            {/* Theme */}
            <div className="settings-field">
              <label>Theme Colors</label>
              <div className="theme-grid">
                <div className="theme-item">
                  <span>Background</span>
                  <input type="color" value={theme.bgDeep} onChange={(e) => setTheme((t) => ({ ...t, bgDeep: e.target.value }))} />
                </div>
                <div className="theme-item">
                  <span>Accent</span>
                  <input type="color" value={theme.accent} onChange={(e) => setTheme((t) => ({ ...t, accent: e.target.value, accentHover: e.target.value }))} />
                </div>
                <div className="theme-item">
                  <span>Text</span>
                  <input type="color" value={theme.textPrimary} onChange={(e) => setTheme((t) => ({ ...t, textPrimary: e.target.value }))} />
                </div>
                <div className="theme-item">
                  <span>Glass</span>
                  <input type="color" value={theme.bgPrimary} onChange={(e) => setTheme((t) => ({ ...t, bgPrimary: e.target.value, glassBg: hexToRgba(e.target.value, 0.45) }))} />
                </div>
              </div>
              <div className="theme-sliders">
                <div className="slider-row">
                  <span className="slider-label">Blur</span>
                  <input type="range" min="0" max="60" value={theme.panelBlur} onChange={(e) => setTheme((t) => ({ ...t, panelBlur: parseInt(e.target.value) }))} className="slider" />
                  <span className="slider-value">{theme.panelBlur}px</span>
                </div>
                <div className="slider-row">
                  <span className="slider-label">Radius</span>
                  <input type="range" min="0" max="32" value={theme.radius} onChange={(e) => setTheme((t) => ({ ...t, radius: parseInt(e.target.value) }))} className="slider" />
                  <span className="slider-value">{theme.radius}px</span>
                </div>
                <div className="slider-row">
                  <span className="slider-label">Clock</span>
                  <input type="range" min="3" max="12" step="0.5" value={parseFloat(theme.clockSize.match(/[\d.]+/)?.[0] || '5.5')} onChange={(e) => setTheme((t) => ({ ...t, clockSize: `clamp(${e.target.value}rem, ${(parseFloat(e.target.value) * 2.3).toFixed(1)}vw, ${(parseFloat(e.target.value) * 1.7).toFixed(1)}rem)` }))} className="slider" />
                  <span className="slider-value">{theme.clockSize.match(/[\d.]+/)?.[0]}rem</span>
                </div>
              </div>
              <button className="btn-link" onClick={() => setTheme(DEFAULT_THEME)}>Reset to default theme</button>
            </div>

            {/* Weather */}
            <div className="settings-field">
              <label>Weather Location</label>
              <div className="city-search-row">
                <input type="text" value={manualCity} onChange={(e) => setManualCity(e.target.value)} placeholder="Type city name..." onKeyDown={(e) => e.key === 'Enter' && searchCity()} />
                <button className="btn-primary small" onClick={searchCity}>Search</button>
              </div>
              <div className="location-settings-row">
                <button className="location-detect-btn" onClick={requestLocation}><IconLocation /> Detect Location</button>
                {lat !== null && lon !== null && (
                  <span className="location-detected">{locationCity || `${lat.toFixed(2)}, ${lon.toFixed(2)}`}</span>
                )}
              </div>
              <div className="coords-row">
                <input type="number" value={lat ?? ''} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) { setLat(v); localStorage.setItem('lat', v.toString()); } }} placeholder="Latitude" step="0.01" />
                <input type="number" value={lon ?? ''} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) { setLon(v); localStorage.setItem('lon', v.toString()); } }} placeholder="Longitude" step="0.01" />
              </div>
              <p className="hint">Tip: Location Services requires the built app (not dev mode). If the app doesn't appear in System Settings, build with <code>npm run tauri:build</code> and run the .app bundle.</p>
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

/* Helper to convert hex to rgba for glass panels */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default App;
