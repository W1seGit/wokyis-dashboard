import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import JSZip from 'jszip';
import { storeSet, storeGet, storeDelete, migrateFromLocalStorage } from './store';
import './App.css';

/* ============================================================
   TYPES
   ============================================================ */

interface Pos { x: number; y: number }

interface WidgetStyle {
  fontSize?: string;
  color?: string;
  opacity?: number;
  scale?: number;
  padding?: string;
  gap?: string;
  borderRadius?: number;
  background?: string;
  borderColor?: string;
  backdropBlur?: number;
  fontWeight?: number;
  letterSpacing?: string;
  textShadow?: string;
  lineHeight?: string;
  customCss?: string;
}

interface ThemeColors {
  bgDeep: string; bgPrimary: string; bgSecondary: string;
  textPrimary: string; textSecondary: string; textDim: string;
  accent: string; accentHover: string;
  glassBg: string; glassBorder: string;
  panelBlur: number; clockSize: string; radius: number;
  widgetStyles: Record<string, Partial<WidgetStyle>>;
  customCss: string;
}

interface Visibility {
  weather: boolean; calendar: boolean; settingsButtons: boolean;
  clock: boolean; date: boolean; nowPlaying: boolean; timer: boolean;
}

interface SavedTheme {
  id: string; name: string;
  backgroundType: 'youtube' | 'image' | 'video';
  youtubeUrl: string; youtubeEndTime: number | null; imageUrl: string;
  videoUrl: string; videoPath: string;
  use24Hour: boolean; useFahrenheit: boolean;
  autoHideEnabled: boolean; autoHideDelay: number;
  lat: number | null; lon: number | null; city: string;
  theme: ThemeColors;
  positions: Record<string, Pos>;
  visibility: Visibility;
}

/* ============================================================
   DEFAULTS
   ============================================================ */

const DEFAULT_THEME: ThemeColors = {
  bgDeep: '#020617', bgPrimary: '#0F172A', bgSecondary: '#1E293B',
  textPrimary: '#F8FAFC', textSecondary: '#CBD5E1', textDim: '#64748B',
  accent: '#22C55E', accentHover: '#16A34A',
  glassBg: 'rgba(15, 23, 42, 0.45)', glassBorder: 'rgba(255, 255, 255, 0.08)',
  panelBlur: 24, clockSize: 'clamp(5.5rem, 13vw, 9.5rem)', radius: 16,
  widgetStyles: {},
  customCss: '',
};

const DEFAULT_POSITIONS: Record<string, Pos> = {
  weather: { x: 15, y: 10 },
  calendar: { x: 50, y: 10 },
  settingsButtons: { x: 85, y: 10 },
  clock: { x: 50, y: 45 },
  date: { x: 50, y: 58 },
  nowPlaying: { x: 15, y: 90 },
  timer: { x: 85, y: 90 },
};

const DEFAULT_VISIBILITY: Visibility = {
  weather: true, calendar: true, settingsButtons: true,
  clock: true, date: true, nowPlaying: true, timer: true,
};

const ACTIVE_THEME_KEY = 'wokyis_active_theme';

/* ============================================================
   DEFAULT THEMES
   ============================================================ */

function makeDefaultTheme(
  name: string,
  colors: Partial<ThemeColors>,
  extra?: Partial<SavedTheme>
): SavedTheme {
  return {
    id: genId(),
    name,
    backgroundType: 'youtube',
    youtubeUrl: '',
    youtubeEndTime: null,
    imageUrl: '',
    videoUrl: '',
    videoPath: '',
    use24Hour: true,
    useFahrenheit: false,
    autoHideEnabled: false,
    autoHideDelay: 5,
    lat: null,
    lon: null,
    city: '',
    theme: { ...DEFAULT_THEME, ...colors, widgetStyles: colors.widgetStyles || {}, customCss: colors.customCss || '' },
    positions: { ...DEFAULT_POSITIONS },
    visibility: { ...DEFAULT_VISIBILITY },
    ...extra,
  };
}

const BUILT_IN_THEMES: SavedTheme[] = [
  // Midnight — classic centered layout
  makeDefaultTheme('Midnight', {
    bgDeep: '#020617', bgPrimary: '#0F172A', bgSecondary: '#1E293B',
    textPrimary: '#F8FAFC', textSecondary: '#CBD5E1', textDim: '#64748B',
    accent: '#22C55E', accentHover: '#16A34A',
    glassBg: 'rgba(15, 23, 42, 0.45)', glassBorder: 'rgba(255, 255, 255, 0.08)',
  }),
  // Ocean — weather on the right, airy feel
  makeDefaultTheme('Ocean', {
    bgDeep: '#001219', bgPrimary: '#023047', bgSecondary: '#0a4d68',
    textPrimary: '#e0f7fa', textSecondary: '#90e0ef', textDim: '#48cae4',
    accent: '#00b4d8', accentHover: '#0096c7',
    glassBg: 'rgba(2, 48, 71, 0.5)', glassBorder: 'rgba(144, 224, 239, 0.1)',
  }, {
    positions: {
      weather: { x: 85, y: 10 }, calendar: { x: 50, y: 10 },
      settingsButtons: { x: 15, y: 10 }, clock: { x: 50, y: 45 },
      date: { x: 50, y: 58 }, nowPlaying: { x: 15, y: 90 },
      timer: { x: 85, y: 90 },
    },
  }),
  // Forest — settings at bottom center, spread out
  makeDefaultTheme('Forest', {
    bgDeep: '#081c15', bgPrimary: '#1b4332', bgSecondary: '#2d6a4f',
    textPrimary: '#d8f3dc', textSecondary: '#b7e4c7', textDim: '#74c69d',
    accent: '#52b788', accentHover: '#40916c',
    glassBg: 'rgba(27, 67, 50, 0.5)', glassBorder: 'rgba(183, 228, 199, 0.1)',
  }, {
    positions: {
      weather: { x: 15, y: 10 }, calendar: { x: 85, y: 10 },
      settingsButtons: { x: 50, y: 90 }, clock: { x: 50, y: 40 },
      date: { x: 50, y: 53 }, nowPlaying: { x: 15, y: 90 },
      timer: { x: 85, y: 90 },
    },
  }),
  // Sunset — asymmetric, clock left-of-center, date to the right
  makeDefaultTheme('Sunset', {
    bgDeep: '#1a0f1a', bgPrimary: '#2d1b2e', bgSecondary: '#4a2040',
    textPrimary: '#ffe4e1', textSecondary: '#ffb7b2', textDim: '#ff9aa2',
    accent: '#ff6b6b', accentHover: '#ee5253',
    glassBg: 'rgba(45, 27, 46, 0.5)', glassBorder: 'rgba(255, 183, 178, 0.12)',
  }, {
    positions: {
      weather: { x: 85, y: 15 }, calendar: { x: 15, y: 85 },
      settingsButtons: { x: 15, y: 10 }, clock: { x: 40, y: 45 },
      date: { x: 70, y: 45 }, nowPlaying: { x: 50, y: 85 },
      timer: { x: 85, y: 85 },
    },
  }),
  // Minimal — ultra clean, only clock + date + settings visible
  makeDefaultTheme('Minimal', {
    bgDeep: '#000000', bgPrimary: '#111111', bgSecondary: '#222222',
    textPrimary: '#ffffff', textSecondary: '#aaaaaa', textDim: '#666666',
    accent: '#555555', accentHover: '#777777',
    glassBg: 'rgba(17, 17, 17, 0.6)', glassBorder: 'rgba(255, 255, 255, 0.1)',
    panelBlur: 16,
  }, {
    positions: {
      weather: { x: 15, y: 10 }, calendar: { x: 50, y: 10 },
      settingsButtons: { x: 85, y: 10 }, clock: { x: 50, y: 50 },
      date: { x: 50, y: 62 }, nowPlaying: { x: 15, y: 90 },
      timer: { x: 85, y: 90 },
    },
    visibility: {
      weather: false, calendar: false, settingsButtons: true,
      clock: true, date: true, nowPlaying: false, timer: false,
    },
  }),
  // Cyber — all corners used, timer top-center
  makeDefaultTheme('Cyber', {
    bgDeep: '#0d0221', bgPrimary: '#1a0b2e', bgSecondary: '#2d1b4e',
    textPrimary: '#f0e6ff', textSecondary: '#c77dff', textDim: '#9d4edd',
    accent: '#ff00ff', accentHover: '#e0aaff',
    glassBg: 'rgba(26, 11, 46, 0.5)', glassBorder: 'rgba(199, 125, 255, 0.15)',
    customCss: '[data-widget="clock"] { text-shadow: 0 0 20px rgba(255,0,255,0.3); }',
  }, {
    positions: {
      weather: { x: 15, y: 15 }, calendar: { x: 85, y: 15 },
      settingsButtons: { x: 15, y: 85 }, clock: { x: 50, y: 45 },
      date: { x: 50, y: 58 }, nowPlaying: { x: 85, y: 85 },
      timer: { x: 50, y: 15 },
    },
  }),
];

function genId() { return Math.random().toString(36).slice(2, 10); }
function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ============================================================
   ICONS
   ============================================================ */

const Ico = ({ d, w = 20 }: { d: string; w?: number }) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const IconSettings   = () => <Ico d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />;
const IconFocus      = () => <Ico d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />;
const IconFocusOff   = () => <Ico d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />;
const IconTimer      = () => <Ico d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-14v4l3 3" />;
const IconPlay       = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>;
const IconPause      = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>;
const IconReset      = () => <Ico d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" />;
const IconLocation   = () => <Ico d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />;
const IconLock       = () => <Ico d="M19 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2zm-7-7a5 5 0 0 1 5 5v3H7V9a5 5 0 0 1 5-5z" />;
const IconMusic      = () => <Ico d="M9 18V5l12-2v13" />;
const IconCalendar   = () => <Ico d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />;
const IconTrash      = () => <Ico d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />;
const IconUpload     = () => <Ico d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />;
const IconPlus       = () => <Ico d="M12 5v14M5 12h14" />;
const IconSearch     = () => <Ico d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />;
const IconGeneral    = () => <Ico d="M12 20h9M12 20V4m0 0H3m9 0v16" />;
const IconBg         = () => <Ico d="M4 16l4.586-4.586a2 2 0 0 1 2.828 0L16 16m-2-2l1.586-1.586a2 2 0 0 1 2.828 0L20 14m-6-6h.01M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />;
const IconWeatherIco = () => <Ico d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9" />;
const IconPalette    = () => <Ico d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69z" />;
const IconThemes     = () => <Ico d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69z" />;
const IconLayout     = () => <Ico d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />;
const IconMove       = () => <Ico d="M5 9l4-4 4 4M9 5v14" />;
const IconEye        = () => <Ico d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />;
const IconEyeOff     = () => <Ico d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />;
const IconPencil     = () => <Ico d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />;
const IconCheck      = () => <Ico d="M20 6L9 17l-5-5" />;
const IconX          = () => <Ico d="M18 6L6 18M6 6l12 12" />;
const IconGlobe      = () => <Ico d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 0 1 0-16 8 8 0 0 1 0 16zM2 12h20" />;
const IconSun        = () => <Ico d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" />;
const IconCloudSun   = () => <Ico d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9zM12 2v2m0 6v2m-7-5 1.5 1.5m12.5-1.5L19 5" />;
const IconCloud      = () => <Ico d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" />;
const IconFog        = () => <Ico d="M4 15h16M4 9h16M4 12h16" />;
const IconDrizzle    = () => <Ico d="M8 19v2M8 13v2M16 19v2M16 13v2M12 21v2M12 15v2M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />;
const IconRain       = () => <Ico d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9M16 14v6M8 14v6M12 16v6" />;
const IconSnow       = () => <Ico d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25M8 16h.01M8 20h.01M12 18h.01M12 22h.01M16 16h.01M16 20h.01" />;
const IconStorm      = () => <Ico d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9M13 11l-4 6h6l-4 6" />;
const IconImage      = () => <Ico d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14l4-4 5 5 6-6 3 3z" />;
const IconYoutube    = () => <Ico d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.94 2C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" />;
const IconFolder     = () => <Ico d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />;
const IconVideo      = () => <Ico d="M23 7l-7 5 7 5V7zM2 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />;


/* ============================================================
   THEME FILE HELPERS
   ============================================================ */

async function saveThemeToFile(theme: SavedTheme): Promise<void> {
  const zip = new JSZip();
  zip.file('theme.json', JSON.stringify(theme.theme, null, 2));
  zip.file('settings.json', JSON.stringify({
    backgroundType: theme.backgroundType, youtubeUrl: theme.youtubeUrl, youtubeEndTime: theme.youtubeEndTime, imageUrl: theme.imageUrl,
    videoUrl: theme.videoUrl, videoPath: theme.videoPath,
    use24Hour: theme.use24Hour, useFahrenheit: theme.useFahrenheit, autoHideEnabled: theme.autoHideEnabled, autoHideDelay: theme.autoHideDelay,
    lat: theme.lat, lon: theme.lon, city: theme.city, positions: theme.positions, visibility: theme.visibility,
  }, null, 2));
  zip.file('custom.css', theme.theme.customCss || '/* Add your custom CSS here */\n');
  const blob = await zip.generateAsync({ type: 'blob' });
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  await invoke('save_theme_file', { name: theme.name.replace(/[^a-zA-Z0-9\\-_ ]/g, '').trim() || 'Untitled', data: Array.from(bytes) });
}

async function loadThemesFromFiles(): Promise<SavedTheme[]> {
  const files: string[] = await invoke('list_theme_files');
  const themes: SavedTheme[] = [];
  for (const name of files) {
    try {
      const bytes: number[] = await invoke('read_theme_file', { name });
      const buffer = new Uint8Array(bytes);
      const zip = await JSZip.loadAsync(buffer);
      const themeJson = await zip.file('theme.json')?.async('string');
      const settingsJson = await zip.file('settings.json')?.async('string');
      const customCss = await zip.file('custom.css')?.async('string');
      if (!themeJson) continue;
      const themeColors = JSON.parse(themeJson) as ThemeColors;
      const settings = settingsJson ? JSON.parse(settingsJson) : {};
      themes.push({
        id: genId(), name,
        backgroundType: settings.backgroundType || 'youtube',
        youtubeUrl: settings.youtubeUrl || '',
        youtubeEndTime: settings.youtubeEndTime ?? null,
        imageUrl: settings.imageUrl || '',
        videoUrl: settings.videoUrl || '',
        videoPath: settings.videoPath || '',
        use24Hour: settings.use24Hour ?? true,
        useFahrenheit: settings.useFahrenheit ?? false,
        autoHideEnabled: settings.autoHideEnabled ?? false,
        autoHideDelay: settings.autoHideDelay ?? 5,
        lat: settings.lat ?? null,
        lon: settings.lon ?? null,
        city: settings.city || '',
        theme: { ...DEFAULT_THEME, ...themeColors, widgetStyles: themeColors.widgetStyles || {}, customCss: customCss ?? themeColors.customCss ?? '' },
        positions: settings.positions || { ...DEFAULT_POSITIONS },
        visibility: settings.visibility || { ...DEFAULT_VISIBILITY },
      });
    } catch { /* ignore broken files */ }
  }
  return themes;
}

async function deleteThemeFile(name: string): Promise<void> {
  await invoke('delete_theme_file', { name });
}

async function openThemesFolder(): Promise<void> {
  await invoke('open_themes_dir');
}

/* ============================================================
   APP
   ============================================================ */

function App() {
  /* --- time --- */
  const [time, setTime] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(id); }, []);

  /* --- themes --- */
  const [themes, setThemes] = useState<SavedTheme[]>([]);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [newThemeName, setNewThemeName] = useState('');
  const [showNewThemeInput, setShowNewThemeInput] = useState(false);
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [editThemeJson, setEditThemeJson] = useState('');
  const [renamingThemeId, setRenamingThemeId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  /* --- background --- */
  const [backgroundType, setBackgroundType] = useState<'youtube' | 'image' | 'video'>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeEndTime, setYoutubeEndTime] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoPath, setVideoPath] = useState('');

  /* --- clock --- */
  const [use24Hour, setUse24Hour] = useState(true);
  const [useFahrenheit, setUseFahrenheit] = useState(false);

  /* --- auto-hide --- */
  const [autoHideEnabled, setAutoHideEnabled] = useState(false);
  const [autoHideDelay, setAutoHideDelay] = useState(5);
  const [uiHidden, setUiHidden] = useState(false);
  const autoHideTimerRef = useRef<number | null>(null);

  /* --- layout editor --- */
  const [editLayoutMode, setEditLayoutMode] = useState(false);
  const [positions, setPositions] = useState<Record<string, Pos>>(DEFAULT_POSITIONS);
  const [visibility, setVisibility] = useState<Visibility>(DEFAULT_VISIBILITY);
  const draggingRef = useRef<{ key: string; startX: number; startY: number; startPos: Pos } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [snapGuides, setSnapGuides] = useState<{ v: number | null; h: number | null }>({ v: null, h: null });

  /* --- weather --- */
  const [weather, setWeather] = useState<{ tempC: number; description: string; code: number } | null>(null);
  const [weatherError, setWeatherError] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [locationCity, setLocationCity] = useState('');
  const [manualCity, setManualCity] = useState('');

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

  /* --- focus --- */
  const [focusMode, setFocusMode] = useState(false);

  /* --- settings --- */
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'background' | 'weather' | 'themes' | 'theme' | 'layout'>('general');
  const [settingsSearch, setSettingsSearch] = useState('');

  /* --- theme --- */
  const [theme, setTheme] = useState<ThemeColors>(DEFAULT_THEME);

  /* --- widget settings popover --- */
  const [activeWidgetSettings, setActiveWidgetSettings] = useState<string | null>(null);
  const widgetSettingsRef = useRef<HTMLDivElement>(null);

  /* ==========================================================
     PERSISTENCE
     ========================================================== */
  useEffect(() => {
    const init = async () => {
      await migrateFromLocalStorage();
      const bgType = await storeGet<'youtube' | 'image' | 'video'>('backgroundType');
      if (bgType) setBackgroundType(bgType);
      const ytu = await storeGet<string>('youtubeUrl');
      if (ytu !== null) setYoutubeUrl(ytu);
      const yet = await storeGet<number>('youtubeEndTime');
      setYoutubeEndTime(yet ?? null);
      const img = await storeGet<string>('imageUrl');
      if (img !== null) setImageUrl(img);
      const vid = await storeGet<string>('videoUrl');
      if (vid !== null) setVideoUrl(vid);
      const vpath = await storeGet<string>('videoPath');
      if (vpath !== null) setVideoPath(vpath);
      const u24 = await storeGet<boolean>('use24Hour');
      setUse24Hour(u24 !== false);
      const uf = await storeGet<boolean>('useFahrenheit');
      setUseFahrenheit(uf === true);
      const ahe = await storeGet<boolean>('autoHideEnabled');
      setAutoHideEnabled(ahe === true);
      const ahd = await storeGet<number>('autoHideDelay');
      setAutoHideDelay(ahd ?? 5);
      const lt = await storeGet<number>('lat');
      setLat(lt ?? null);
      const ln = await storeGet<number>('lon');
      setLon(ln ?? null);
      const lc = await storeGet<string>('locationCity');
      if (lc !== null) setLocationCity(lc);
      const pos = await storeGet<Record<string, Pos>>('positions');
      if (pos) setPositions(pos);
      const vis = await storeGet<Visibility>('visibility');
      if (vis) setVisibility(vis);
      const ts = await storeGet<number>('timerSeconds');
      const tt = await storeGet<number>('timerTotal');
      if (ts !== null) setTimerSeconds(ts);
      if (tt !== null) setTimerTotal(tt);
      const thm = await storeGet<ThemeColors>('theme');
      if (thm) {
        // Migrate old themes without new fields
        setTheme({
          ...DEFAULT_THEME,
          ...thm,
          widgetStyles: thm.widgetStyles || {},
          customCss: thm.customCss || '',
        });
      }
      // Load themes from files + add built-ins if none exist yet
      let fileThemes: SavedTheme[] = [];
      try {
        fileThemes = await loadThemesFromFiles();
        console.log('[themes] Loaded', fileThemes.length, 'themes from files');
      } catch (err) {
        console.error('[themes] Failed to load themes from files:', err);
      }
      const storedActive = await storeGet<string>(ACTIVE_THEME_KEY);

      // Migrate old presets if any exist
      try {
        const oldPresets = await storeGet<any[]>('wokyis_presets');
        if (oldPresets && Array.isArray(oldPresets) && oldPresets.length > 0 && fileThemes.length === 0) {
          console.log('[themes] Migrating', oldPresets.length, 'old presets');
          for (const old of oldPresets) {
            const migrated: SavedTheme = {
              id: old.id || genId(),
              name: old.name || 'Migrated',
              backgroundType: old.backgroundType || 'youtube',
              youtubeUrl: old.youtubeUrl || '',
              youtubeEndTime: old.youtubeEndTime ?? null,
              imageUrl: old.imageUrl || '',
              videoUrl: old.videoUrl || '',
              videoPath: old.videoPath || '',
              use24Hour: old.use24Hour ?? true,
              useFahrenheit: old.useFahrenheit ?? false,
              autoHideEnabled: old.autoHideEnabled ?? false,
              autoHideDelay: old.autoHideDelay ?? 5,
              lat: old.lat ?? null,
              lon: old.lon ?? null,
              city: old.city || '',
              theme: { ...DEFAULT_THEME, ...(old.theme || {}) },
              positions: old.positions || { ...DEFAULT_POSITIONS },
              visibility: old.visibility || { ...DEFAULT_VISIBILITY },
            };
            await saveThemeToFile(migrated);
          }
          fileThemes = await loadThemesFromFiles();
          await storeDelete('wokyis_presets');
          await storeDelete('wokyis_active_preset');
        }
      } catch (err) {
        console.error('[themes] Migration failed:', err);
      }

      if (fileThemes.length === 0) {
        console.log('[themes] No themes found, seeding built-in themes');
        for (const t of BUILT_IN_THEMES) {
          try {
            await saveThemeToFile(t);
          } catch (err) {
            console.error('[themes] Failed to save built-in theme', t.name, err);
          }
        }
        try {
          fileThemes = await loadThemesFromFiles();
        } catch (err) {
          console.error('[themes] Failed to reload themes after seeding:', err);
        }
      }

      setThemes(fileThemes);
      if (storedActive) {
        const found = fileThemes.find((t) => t.id === storedActive);
        if (found) setActiveThemeId(storedActive);
      }
    };
    init();
  }, []);

  /* ==========================================================
     THEME CSS
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

  // Inject custom CSS
  useEffect(() => {
    let styleEl = document.getElementById('wokyis-custom-css') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'wokyis-custom-css';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = theme.customCss || '';
  }, [theme.customCss]);

  const updateWidgetStyle = (key: string, updates: Partial<WidgetStyle>) => {
    setTheme((prev) => ({
      ...prev,
      widgetStyles: {
        ...prev.widgetStyles,
        [key]: { ...prev.widgetStyles[key], ...updates },
      },
    }));
  };

  const getWidgetInlineStyle = (key: string): React.CSSProperties => {
    const s = theme.widgetStyles[key];
    if (!s) return {};
    const style: React.CSSProperties = {};
    if (s.opacity !== undefined) style.opacity = s.opacity;
    if (s.scale !== undefined) style.transform = `translate(-50%, -50%) scale(${s.scale})`;
    return style;
  };

  // Generate per-widget CSS and inject it
  useEffect(() => {
    let styleEl = document.getElementById('wokyis-widget-styles') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'wokyis-widget-styles';
      document.head.appendChild(styleEl);
    }
    let css = '';
    Object.entries(theme.widgetStyles).forEach(([key, s]) => {
      if (!s || Object.keys(s).length === 0) return;
      const selector = `[data-widget="${key}"]`;
      const inner = `${selector} .glass-panel, ${selector} .clock, ${selector} .date-text, ${selector} .timer-wrapper, ${selector} .settings-buttons-row`;
      const text = `${selector}, ${selector} .glass-panel, ${selector} .clock, ${selector} .date-text, ${selector} .weather-temp, ${selector} .weather-desc, ${selector} .location-name, ${selector} .calendar-text, ${selector} .np-text, ${selector} .timer-text, ${selector} .preset-btn`;

      if (s.fontSize) css += `${text} { font-size: ${s.fontSize} !important; }\n`;
      if (s.color) css += `${text} { color: ${s.color} !important; }\n`;
      if (s.fontWeight) css += `${text} { font-weight: ${s.fontWeight} !important; }\n`;
      if (s.letterSpacing) css += `${text} { letter-spacing: ${s.letterSpacing} !important; }\n`;
      if (s.textShadow) css += `${text} { text-shadow: ${s.textShadow} !important; }\n`;
      if (s.lineHeight) css += `${text} { line-height: ${s.lineHeight} !important; }\n`;
      if (s.padding) css += `${inner} { padding: ${s.padding} !important; }\n`;
      if (s.gap) css += `${inner} { gap: ${s.gap} !important; }\n`;
      if (s.borderRadius !== undefined) css += `${inner} { border-radius: ${s.borderRadius}px !important; }\n`;
      if (s.background) css += `${inner} { background: ${s.background} !important; }\n`;
      if (s.borderColor) css += `${inner} { border-color: ${s.borderColor} !important; }\n`;
      if (s.backdropBlur !== undefined) css += `${inner} { backdrop-filter: blur(${s.backdropBlur}px) !important; -webkit-backdrop-filter: blur(${s.backdropBlur}px) !important; }\n`;
      if (s.opacity !== undefined) css += `${selector} { opacity: ${s.opacity} !important; }\n`;
      if (s.scale !== undefined) css += `${selector} { transform: translate(-50%, -50%) scale(${s.scale}) !important; }\n`;
      if (s.customCss) css += `${selector} { ${s.customCss} }\n`;
    });
    styleEl.textContent = css;
  }, [theme.widgetStyles]);

  /* ==========================================================
     CLOCK
     ========================================================== */
  const formattedTime = useMemo(() => {
    let h: number; let ampm = '';
    if (use24Hour) { h = time.getHours(); }
    else { h = time.getHours() % 12; h = h === 0 ? 12 : h; ampm = time.getHours() >= 12 ? ' PM' : ' AM'; }
    return { hours: h.toString().padStart(use24Hour ? 2 : 0, '0'), minutes: time.getMinutes().toString().padStart(2, '0'), seconds: time.getSeconds().toString().padStart(2, '0'), ampm };
  }, [time, use24Hour]);

  const formattedDate = useMemo(() => time.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), [time]);

  const displayTemp = useMemo(() => {
    if (!weather) return null;
    if (useFahrenheit) return { value: Math.round(weather.tempC * 9 / 5 + 32), unit: '°F' };
    return { value: weather.tempC, unit: '°C' };
  }, [weather, useFahrenheit]);

  /* ==========================================================
     BACKGROUND SRC
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

  const videoBackgroundSrc = useMemo(() => {
    if (backgroundType !== 'video') return null;
    if (videoPath) {
      try {
        return convertFileSrc(videoPath);
      } catch {
        return null;
      }
    }
    if (videoUrl) return videoUrl;
    return null;
  }, [backgroundType, videoPath, videoUrl]);

  /* ==========================================================
     AUTO-HIDE
     ========================================================== */
  const resetAutoHide = useCallback(() => {
    setUiHidden(false);
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    if (autoHideEnabled && !showSettings && !editLayoutMode) {
      autoHideTimerRef.current = window.setTimeout(() => setUiHidden(true), autoHideDelay * 1000);
    }
  }, [autoHideEnabled, autoHideDelay, showSettings, editLayoutMode]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (activeWidgetSettings && widgetSettingsRef.current && !widgetSettingsRef.current.contains(e.target as Node)) {
        setActiveWidgetSettings(null);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [activeWidgetSettings]);

  useEffect(() => {
    if (!autoHideEnabled || showSettings || editLayoutMode) { setUiHidden(false); if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current); return; }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'];
    events.forEach(e => window.addEventListener(e, resetAutoHide));
    resetAutoHide();
    return () => { events.forEach(e => window.removeEventListener(e, resetAutoHide)); if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current); };
  }, [resetAutoHide, autoHideEnabled, showSettings, editLayoutMode]);

  /* ==========================================================
     NOW PLAYING
     ========================================================== */
  useEffect(() => {
    const fetchNP = async () => { try { const r: string = await invoke('get_now_playing'); setNowPlaying(r); } catch { setNowPlaying(''); } };
    fetchNP(); const id = setInterval(fetchNP, 5000); return () => clearInterval(id);
  }, []);

  /* ==========================================================
     CALENDAR
     ========================================================== */
  useEffect(() => {
    const fetchCal = async () => { try { const r: string = await invoke('get_next_calendar_event'); setCalendarEvent(r); } catch { setCalendarEvent(''); } };
    fetchCal(); const id = setInterval(fetchCal, 30000); return () => clearInterval(id);
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
  const setPresetMins = (mins: number) => { setTimerRunning(false); endTimeRef.current = null; setTimerSeconds(mins * 60); setTimerTotal(mins * 60); storeSet('timerTotal', mins * 60); };
  const formattedTimer = `${String(Math.floor(timerSeconds / 60)).padStart(2, '0')}:${String(timerSeconds % 60).padStart(2, '0')}`;

  /* ==========================================================
     WEATHER
     ========================================================== */
  const fetchWeather = useCallback(async (latitude: number, longitude: number) => {
    try {
      const unitParam = useFahrenheit ? '&temperature_unit=fahrenheit' : '';
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true${unitParam}`);
      const data = await res.json();
      if (data.current_weather) {
        const code = data.current_weather.weathercode;
        const desc: Record<number, string> = { 0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime Fog', 51: 'Light Drizzle', 53: 'Moderate Drizzle', 55: 'Dense Drizzle', 61: 'Slight Rain', 63: 'Moderate Rain', 65: 'Heavy Rain', 71: 'Slight Snow', 73: 'Moderate Snow', 75: 'Heavy Snow', 80: 'Slight Showers', 81: 'Moderate Showers', 82: 'Violent Showers', 95: 'Thunderstorm', 96: 'Hail', 99: 'Hail' };
        const temp = data.current_weather.temperature;
        setWeather({ tempC: useFahrenheit ? Math.round((temp - 32) * 5 / 9) : temp, description: desc[code] || 'Unknown', code });
      }
    } catch { setWeatherError('Weather fetch failed'); }
  }, [useFahrenheit]);

  useEffect(() => {
    if (lat === null || lon === null) return;
    fetchWeather(lat, lon);
    const id = setInterval(() => { if (lat !== null && lon !== null) fetchWeather(lat, lon); }, 600000);
    return () => clearInterval(id);
  }, [lat, lon, fetchWeather]);

  /* ==========================================================
     LOCATION (IP-based primary)
     ========================================================== */
  const detectLocationByIP = async () => {
    setWeatherError('');
    try {
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      if (data.latitude && data.longitude) {
        setLat(data.latitude); setLon(data.longitude); setLocationCity(data.city || '');
        await storeSet('lat', data.latitude); await storeSet('lon', data.longitude); await storeSet('locationCity', data.city || '');
      } else { setWeatherError('IP location unavailable'); }
    } catch { setWeatherError('IP location failed — try city search below'); }
  };

  const searchCity = async () => {
    if (!manualCity.trim()) return;
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(manualCity)}&count=1`);
      const data = await res.json();
      if (data.results && data.results[0]) {
        const r = data.results[0];
        setLat(r.latitude); setLon(r.longitude); setLocationCity(r.name);
        await storeSet('lat', r.latitude); await storeSet('lon', r.longitude); await storeSet('locationCity', r.name);
        setWeatherError('');
      } else { setWeatherError('City not found'); }
    } catch { setWeatherError('City search failed'); }
  };

  /* ==========================================================
     DRAGGABLE LAYOUT
     ========================================================== */
  const startDrag = (e: React.MouseEvent, key: string) => {
    if (!editLayoutMode) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, select, a, .widget-settings-popover')) return;
    e.preventDefault();
    e.stopPropagation();
    const container = contentRef.current!;
    const rect = container.getBoundingClientRect();
    const startPos = positions[key];
    const startMX = (e.clientX - rect.left) / rect.width * 100;
    const startMY = (e.clientY - rect.top) / rect.height * 100;
    draggingRef.current = { key, startX: startMX, startY: startMY, startPos };

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const mx = (ev.clientX - rect.left) / rect.width * 100;
      const my = (ev.clientY - rect.top) / rect.height * 100;
      const dx = mx - draggingRef.current.startX;
      const dy = my - draggingRef.current.startY;
      const rawX = draggingRef.current.startPos.x + dx;
      const rawY = draggingRef.current.startPos.y + dy;
      const snapped = snapPosition(rawX, rawY);
      setSnapGuides(snapped.guides);
      setPositions((prev) => ({ ...prev, [key]: { x: snapped.x, y: snapped.y } }));
    };

    const onUp = () => {
      draggingRef.current = null;
      setSnapGuides({ v: null, h: null });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const snapPosition = (x: number, y: number): { x: number; y: number; guides: { v: number | null; h: number | null } } => {
    const threshold = 2;
    let sx = Math.max(5, Math.min(95, x));
    let sy = Math.max(5, Math.min(95, y));
    let gv: number | null = null;
    let gh: number | null = null;
    [10, 25, 50, 75, 90].forEach((g) => {
      if (Math.abs(sx - g) < threshold) { sx = g; gv = g; }
      if (Math.abs(sy - g) < threshold) { sy = g; gh = g; }
    });
    return { x: sx, y: sy, guides: { v: gv, h: gh } };
  };

  const resetLayout = async () => { setPositions(DEFAULT_POSITIONS); await storeSet('positions', DEFAULT_POSITIONS); };

  /* ==========================================================
     THEMES
     ========================================================== */
  const buildCurrentTheme = (name: string): SavedTheme => ({
    id: genId(), name,
    backgroundType, youtubeUrl, youtubeEndTime, imageUrl, videoUrl, videoPath,
    use24Hour, useFahrenheit, autoHideEnabled, autoHideDelay,
    lat, lon, city: locationCity,
    theme, positions, visibility,
  });

  const applyTheme = async (t: SavedTheme) => {
    setBackgroundType(t.backgroundType); setYoutubeUrl(t.youtubeUrl); setYoutubeEndTime(t.youtubeEndTime); setImageUrl(t.imageUrl);
    setUse24Hour(t.use24Hour); setUseFahrenheit(t.useFahrenheit);
    setAutoHideEnabled(t.autoHideEnabled); setAutoHideDelay(t.autoHideDelay);
    setLat(t.lat); setLon(t.lon); setLocationCity(t.city);
    setTheme(t.theme); setPositions(t.positions); setVisibility(t.visibility);
    setActiveThemeId(t.id); await storeSet(ACTIVE_THEME_KEY, t.id);
    setVideoUrl(t.videoUrl); setVideoPath(t.videoPath);
    await storeSet('backgroundType', t.backgroundType); await storeSet('youtubeUrl', t.youtubeUrl);
    await storeSet('youtubeEndTime', t.youtubeEndTime ?? null); await storeSet('imageUrl', t.imageUrl);
    await storeSet('videoUrl', t.videoUrl); await storeSet('videoPath', t.videoPath);
    await storeSet('autoHideEnabled', t.autoHideEnabled); await storeSet('autoHideDelay', t.autoHideDelay);
    if (t.lat !== null) await storeSet('lat', t.lat); if (t.lon !== null) await storeSet('lon', t.lon);
    await storeSet('locationCity', t.city); await storeSet('theme', t.theme);
    await storeSet('positions', t.positions); await storeSet('visibility', t.visibility);
  };

  const updateActiveTheme = async () => {
    if (!activeThemeId) return;
    const idx = themes.findIndex((t) => t.id === activeThemeId);
    if (idx === -1) return;
    const updated = buildCurrentTheme(themes[idx].name);
    updated.id = activeThemeId;
    const next = [...themes]; next[idx] = updated;
    setThemes(next);
    await saveThemeToFile(updated);
  };

  const confirmSaveTheme = async () => {
    const name = newThemeName.trim();
    if (!name) return;
    const t = buildCurrentTheme(name);
    const next = [...themes, t];
    setThemes(next);
    await saveThemeToFile(t);
    setActiveThemeId(t.id); await storeSet(ACTIVE_THEME_KEY, t.id);
    setNewThemeName(''); setShowNewThemeInput(false);
  };

  const deleteTheme = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const t = themes.find((th) => th.id === id);
    if (t) await deleteThemeFile(t.name);
    const next = themes.filter((th) => th.id !== id);
    setThemes(next);
    if (activeThemeId === id) { setActiveThemeId(null); await storeDelete(ACTIVE_THEME_KEY); }
  };

  const startRename = (t: SavedTheme, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingThemeId(t.id);
    setRenameValue(t.name);
  };

  const confirmRename = async () => {
    if (!renamingThemeId || !renameValue.trim()) { setRenamingThemeId(null); return; }
    const old = themes.find((t) => t.id === renamingThemeId);
    if (old) await deleteThemeFile(old.name);
    const next = themes.map((t) => t.id === renamingThemeId ? { ...t, name: renameValue.trim() } : t);
    const updated = next.find((t) => t.id === renamingThemeId);
    if (updated) await saveThemeToFile(updated);
    setThemes(next);
    setRenamingThemeId(null);
  };

  const startEditJson = (t: SavedTheme, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingThemeId(t.id);
    setEditThemeJson(JSON.stringify(t, null, 2));
  };

  const confirmEditJson = async () => {
    if (!editingThemeId) return;
    try {
      const parsed = JSON.parse(editThemeJson) as SavedTheme;
      parsed.id = editingThemeId; // preserve ID
      const old = themes.find((t) => t.id === editingThemeId);
      if (old && old.name !== parsed.name) await deleteThemeFile(old.name);
      const next = themes.map((t) => t.id === editingThemeId ? parsed : t);
      setThemes(next);
      await saveThemeToFile(parsed);
      if (activeThemeId === editingThemeId) await applyTheme(parsed);
      setEditingThemeId(null);
    } catch { alert('Invalid JSON'); }
  };





  /* ==========================================================
     SAVE SETTINGS
     ========================================================== */
  const saveSettings = async () => {
    await storeSet('backgroundType', backgroundType); await storeSet('youtubeUrl', youtubeUrl);
    await storeSet('youtubeEndTime', youtubeEndTime ?? null); await storeSet('imageUrl', imageUrl);
    await storeSet('videoUrl', videoUrl); await storeSet('videoPath', videoPath);
    await storeSet('autoHideEnabled', autoHideEnabled); await storeSet('autoHideDelay', autoHideDelay);
    await storeSet('theme', theme); await storeSet('positions', positions);
    await storeSet('visibility', visibility);
    if (lat !== null) await storeSet('lat', lat); if (lon !== null) await storeSet('lon', lon);
    await storeSet('locationCity', locationCity);
    setShowSettings(false);
  };

  const openLocationSettings = async () => { try { await invoke('open_location_settings'); } catch {} };

  /* ==========================================================
     KEYBOARD
     ========================================================== */
  const toggleFocusMode = () => setFocusMode((f) => !f);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowSettings(false); setEditLayoutMode(false); setActiveWidgetSettings(null); }
      if (e.metaKey || e.ctrlKey) {
        if (e.key === ',') { e.preventDefault(); setShowSettings((s) => !s); }
        if (e.key === 'f') { e.preventDefault(); toggleFocusMode(); }
        if (e.key === 'e') { e.preventDefault(); setEditLayoutMode((m) => !m); setActiveWidgetSettings(null); }
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
     SETTINGS TABS
     ========================================================== */
  const tabs: { id: 'general' | 'background' | 'weather' | 'themes' | 'theme' | 'layout'; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General', icon: <IconGeneral /> },
    { id: 'background', label: 'Background', icon: <IconBg /> },
    { id: 'weather', label: 'Weather', icon: <IconWeatherIco /> },
    { id: 'layout', label: 'Layout', icon: <IconLayout /> },
    { id: 'themes', label: 'Themes', icon: <IconThemes /> },
    { id: 'theme', label: 'Theme', icon: <IconPalette /> },
  ];
  const visibleTabs = settingsSearch ? tabs.filter((t) => t.label.toLowerCase().includes(settingsSearch.toLowerCase())) : tabs;

  /* ==========================================================
     RENDER WIDGET WRAPPER
     ========================================================== */
  const Widget = ({ widgetKey, children, className = '' }: { widgetKey: string; children: React.ReactNode; className?: string }) => {
    const pos = positions[widgetKey] || DEFAULT_POSITIONS[widgetKey];
    const vis = visibility[widgetKey as keyof Visibility];
    if (!vis) return null;
    const inline = getWidgetInlineStyle(widgetKey);
    const isEditing = activeWidgetSettings === widgetKey;
    const ws = theme.widgetStyles[widgetKey] || {};

    return (
      <div
        data-widget={widgetKey}
        className={`widget-wrapper ${editLayoutMode ? 'edit-mode' : ''} ${uiHidden && widgetKey !== 'clock' && widgetKey !== 'date' && widgetKey !== 'weather' ? 'ui-hideable' : ''} ${className}`}
        style={{ left: `${pos.x}%`, top: `${pos.y}%`, ...inline }}
        onMouseDown={(e) => startDrag(e, widgetKey)}
      >
        {editLayoutMode && (
          <div className="widget-edit-bar">
            <div className="widget-drag-handle" title="Drag to move">
              <IconMove />
            </div>
            <button className="widget-settings-btn" title="Widget Settings" onClick={(e) => { e.stopPropagation(); setActiveWidgetSettings(isEditing ? null : widgetKey); }}>
              <Ico d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" w={14} />
            </button>
          </div>
        )}
        {isEditing && editLayoutMode && (
          <div className="widget-settings-popover" ref={widgetSettingsRef} onClick={(e) => e.stopPropagation()}>
            <div className="widget-settings-header">
              <span>{widgetKey.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())} Settings</span>
              <button className="widget-settings-close" onClick={() => setActiveWidgetSettings(null)}><IconX /></button>
            </div>
            <div className="widget-settings-body">
              <div className="widget-settings-field">
                <label>Font Size</label>
                <input type="text" value={ws.fontSize || ''} placeholder="e.g. 1.2rem" onChange={(e) => updateWidgetStyle(widgetKey, { fontSize: e.target.value || undefined })} />
              </div>
              <div className="widget-settings-field">
                <label>Color</label>
                <input type="color" value={ws.color || theme.textPrimary} onChange={(e) => updateWidgetStyle(widgetKey, { color: e.target.value })} />
              </div>
              <div className="widget-settings-field">
                <label>Opacity</label>
                <div className="slider-row">
                  <input type="range" min="0" max="1" step="0.05" value={ws.opacity ?? 1} onChange={(e) => updateWidgetStyle(widgetKey, { opacity: parseFloat(e.target.value) })} className="slider" />
                  <span className="slider-value">{Math.round((ws.opacity ?? 1) * 100)}%</span>
                </div>
              </div>
              <div className="widget-settings-field">
                <label>Scale</label>
                <div className="slider-row">
                  <input type="range" min="0.5" max="2" step="0.05" value={ws.scale ?? 1} onChange={(e) => updateWidgetStyle(widgetKey, { scale: parseFloat(e.target.value) })} className="slider" />
                  <span className="slider-value">{(ws.scale ?? 1).toFixed(2)}x</span>
                </div>
              </div>
              <div className="widget-settings-field">
                <label>Padding</label>
                <input type="text" value={ws.padding || ''} placeholder="e.g. 14px 22px" onChange={(e) => updateWidgetStyle(widgetKey, { padding: e.target.value || undefined })} />
              </div>
              <div className="widget-settings-field">
                <label>Gap</label>
                <input type="text" value={ws.gap || ''} placeholder="e.g. 12px" onChange={(e) => updateWidgetStyle(widgetKey, { gap: e.target.value || undefined })} />
              </div>
              <div className="widget-settings-field">
                <label>Border Radius</label>
                <div className="slider-row">
                  <input type="range" min="0" max="40" value={ws.borderRadius ?? theme.radius} onChange={(e) => updateWidgetStyle(widgetKey, { borderRadius: parseInt(e.target.value) })} className="slider" />
                  <span className="slider-value">{ws.borderRadius ?? theme.radius}px</span>
                </div>
              </div>
              <div className="widget-settings-field">
                <label>Background</label>
                <input type="text" value={ws.background || ''} placeholder="e.g. rgba(0,0,0,0.5)" onChange={(e) => updateWidgetStyle(widgetKey, { background: e.target.value || undefined })} />
              </div>
              <div className="widget-settings-field">
                <label>Border Color</label>
                <input type="text" value={ws.borderColor || ''} placeholder="e.g. rgba(255,255,255,0.1)" onChange={(e) => updateWidgetStyle(widgetKey, { borderColor: e.target.value || undefined })} />
              </div>
              <div className="widget-settings-field">
                <label>Backdrop Blur</label>
                <div className="slider-row">
                  <input type="range" min="0" max="60" value={ws.backdropBlur ?? theme.panelBlur} onChange={(e) => updateWidgetStyle(widgetKey, { backdropBlur: parseInt(e.target.value) })} className="slider" />
                  <span className="slider-value">{ws.backdropBlur ?? theme.panelBlur}px</span>
                </div>
              </div>
              <div className="widget-settings-field">
                <label>Font Weight</label>
                <div className="slider-row">
                  <input type="range" min="100" max="900" step="100" value={ws.fontWeight ?? 400} onChange={(e) => updateWidgetStyle(widgetKey, { fontWeight: parseInt(e.target.value) })} className="slider" />
                  <span className="slider-value">{ws.fontWeight ?? 400}</span>
                </div>
              </div>
              <div className="widget-settings-field">
                <label>Letter Spacing</label>
                <input type="text" value={ws.letterSpacing || ''} placeholder="e.g. 0.02em" onChange={(e) => updateWidgetStyle(widgetKey, { letterSpacing: e.target.value || undefined })} />
              </div>
              <div className="widget-settings-field">
                <label>Text Shadow</label>
                <input type="text" value={ws.textShadow || ''} placeholder="e.g. 0 2px 8px rgba(0,0,0,0.5)" onChange={(e) => updateWidgetStyle(widgetKey, { textShadow: e.target.value || undefined })} />
              </div>
              <div className="widget-settings-field">
                <label>Line Height</label>
                <input type="text" value={ws.lineHeight || ''} placeholder="e.g. 1.4" onChange={(e) => updateWidgetStyle(widgetKey, { lineHeight: e.target.value || undefined })} />
              </div>
              <button className="btn-link" onClick={() => updateWidgetStyle(widgetKey, {})}>Reset Widget Styles</button>
            </div>
          </div>
        )}
        {children}
      </div>
    );
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
      {backgroundType === 'video' && videoBackgroundSrc && (
        <div className="video-bg">
          <video src={videoBackgroundSrc} autoPlay loop muted playsInline className="video-bg-element" />
          <div className="video-overlay" />
        </div>
      )}
      {((backgroundType === 'youtube' && !youtubeSrc) || (backgroundType === 'image' && !imageUrl) || (backgroundType === 'video' && !videoBackgroundSrc)) && <div className="bg-gradient" />}

      {/* Snap Guides */}
      {editLayoutMode && (
        <>
          {snapGuides.v !== null && <div className="snap-guide vertical" style={{ left: `${snapGuides.v}%` }} />}
          {snapGuides.h !== null && <div className="snap-guide horizontal" style={{ top: `${snapGuides.h}%` }} />}
        </>
      )}

      {/* Main Content */}
      <div className="content" ref={contentRef}>
        {/* Weather */}
        <Widget widgetKey="weather">
          {weather && displayTemp ? (
            <div className="glass-panel weather-widget">
              <div className="weather-main">
                <span className="weather-icon"><WeatherIcon code={weather.code} /></span>
                <span className="weather-temp">{displayTemp.value}{displayTemp.unit}</span>
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
            <div className="location-prompt">
              {weatherError ? (
                <div className="location-denied-block">
                  <span className="location-error">{weatherError}</span>
                  <button className="location-settings-btn" onClick={openLocationSettings}>
                    <IconLock /> Open Location Settings
                  </button>
                </div>
              ) : (
                <span className="dim-text">Loading weather...</span>
              )}
            </div>
          )}
        </Widget>

        {/* Calendar */}
        <Widget widgetKey="calendar">
          {calendarEvent && !focusMode && (
            <div className="glass-panel calendar-widget">
              <IconCalendar />
              <span className="calendar-text">{calendarEvent}</span>
            </div>
          )}
        </Widget>

        {/* Settings Buttons */}
        <Widget widgetKey="settingsButtons">
          <div className="settings-buttons-row">
            <button className="glass-icon-btn" onClick={toggleFocusMode} title="Toggle Focus Mode (⌘F)">
              {focusMode ? <IconFocusOff /> : <IconFocus />}
            </button>
            <button className="glass-icon-btn" onClick={() => { setEditLayoutMode((m) => !m); setActiveWidgetSettings(null); }} title="Toggle Layout Editor (⌘E)">
              {editLayoutMode ? <IconCheck /> : <IconLayout />}
            </button>
            <button className="glass-icon-btn" onClick={() => setShowSettings((s) => !s)} title="Settings (⌘,)">
              <IconSettings />
            </button>
          </div>
        </Widget>

        {/* Clock */}
        <Widget widgetKey="clock">
          <div className="clock">
            <span className="clock-hours">{formattedTime.hours}</span>
            <span className="clock-sep">:</span>
            <span className="clock-minutes">{formattedTime.minutes}</span>
            <span className="clock-sep">:</span>
            <span className="clock-seconds">{formattedTime.seconds}</span>
            {!use24Hour && <span className="clock-ampm">{formattedTime.ampm}</span>}
          </div>
        </Widget>

        {/* Date */}
        <Widget widgetKey="date">
          <div className="date-text">{formattedDate}</div>
        </Widget>

        {/* Now Playing */}
        <Widget widgetKey="nowPlaying">
          {nowPlaying && !focusMode && (
            <div className="glass-panel now-playing-widget">
              <IconMusic />
              <span className="np-text">{nowPlaying}</span>
            </div>
          )}
        </Widget>

        {/* Timer */}
        <Widget widgetKey="timer">
          <div className="timer-wrapper">
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
        </Widget>
      </div>

      {/* Settings Modal with Sidebar */}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            {/* Sidebar */}
            <div className="settings-sidebar">
              <div className="settings-search">
                <IconSearch />
                <input type="text" placeholder="Search..." value={settingsSearch} onChange={(e) => setSettingsSearch(e.target.value)} />
              </div>
              <nav className="settings-nav">
                {visibleTabs.map((tab) => (
                  <button key={tab.id} className={`settings-nav-item ${settingsTab === tab.id ? 'active' : ''}`} onClick={() => { setSettingsTab(tab.id); setSettingsSearch(''); }}>
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            {/* Content */}
            <div className="settings-content">
              {/* GENERAL */}
              {settingsTab === 'general' && (
                <div className="settings-section">
                  <h3>General</h3>
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
                        <input type="range" min="3" max="60" value={autoHideDelay} onChange={(e) => setAutoHideDelay(parseInt(e.target.value))} className="slider" />
                        <span className="slider-value">{autoHideDelay}s</span>
                      </div>
                    )}
                    <p className="hint">Clock and date are always visible. Other elements fade out after inactivity.</p>
                  </div>
                  <div className="settings-field">
                    <label>Reset</label>
                    <button className="btn-danger" onClick={async () => {
                      try {
                        console.log('[reset] Starting reset...');
                        await invoke('reset_app_data');
                        console.log('[reset] App data cleared');
                        setTimeout(() => {
                          console.log('[reset] Reloading window...');
                          window.location.reload();
                        }, 500);
                      } catch (err) {
                        console.error('[reset] Failed:', err);
                        alert('Reset failed: ' + err);
                      }
                    }}>Reset to Defaults</button>
                    <p className="hint">Clears all settings, themes, and data. The app will restart as if running for the first time.</p>
                  </div>
                </div>
              )}

              {/* BACKGROUND */}
              {settingsTab === 'background' && (
                <div className="settings-section">
                  <h3>Background</h3>
                  <div className="settings-field">
                    <label>Source</label>
                    <div className="toggle-row">
                      <button className={`toggle-btn ${backgroundType === 'youtube' ? 'active' : ''}`} onClick={() => setBackgroundType('youtube')}><IconYoutube /> YouTube</button>
                      <button className={`toggle-btn ${backgroundType === 'image' ? 'active' : ''}`} onClick={() => setBackgroundType('image')}><IconImage /> Image</button>
                      <button className={`toggle-btn ${backgroundType === 'video' ? 'active' : ''}`} onClick={() => setBackgroundType('video')}><IconVideo /> Video</button>
                    </div>
                  </div>
                  {backgroundType === 'youtube' && (
                    <>
                      <div className="settings-field">
                        <label>YouTube URL</label>
                        <input type="text" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
                      </div>
                      <div className="settings-field">
                        <label>Loop End Time (seconds)</label>
                        <input type="number" min="1" value={youtubeEndTime || ''} onChange={(e) => { const v = parseInt(e.target.value); setYoutubeEndTime(isNaN(v) || v <= 0 ? null : v); }} placeholder="e.g. 120 — loops back to start at this time" />
                        <p className="hint">Leave empty to play the full video. Set a time to skip ugly endings.</p>
                      </div>
                    </>
                  )}
                  {backgroundType === 'image' && (
                    <div className="settings-field">
                      <label>Image URL</label>
                      <input type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://example.com/wallpaper.jpg" />
                      <p className="hint">Paste a direct image link. Supports JPG, PNG, WebP.</p>
                    </div>
                  )}
                  {backgroundType === 'video' && (
                    <>
                      <div className="settings-field">
                        <label>Local Video File</label>
                        <div className="city-search-row">
                          <input type="text" value={videoPath ? videoPath.split(/[\\/]/).pop() : ''} placeholder="No file selected" readOnly />
                          <button className="btn-primary small" onClick={async () => {
                            try {
                              const selected = await open({ multiple: false, filters: [{ name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi'] }] });
                              if (selected) {
                                const path = typeof selected === 'string' ? selected : (selected as any).path || '';
                                if (path) { setVideoPath(path); setVideoUrl(''); }
                              }
                            } catch (err) {
                              console.error('File picker failed:', err);
                            }
                          }}>Browse</button>
                        </div>
                        <p className="hint">Select a video file from your computer. Supports MP4, WebM, MOV, MKV, AVI.</p>
                      </div>
                      <div className="settings-field">
                        <label>Or Video URL</label>
                        <input type="text" value={videoUrl} onChange={(e) => { setVideoUrl(e.target.value); setVideoPath(''); }} placeholder="https://example.com/video.mp4" />
                        <p className="hint">Paste a direct link to a video file (MP4, WebM). This will override the local file.</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* WEATHER */}
              {settingsTab === 'weather' && (
                <div className="settings-section">
                  <h3>Weather</h3>
                  <div className="settings-field">
                    <label>Temperature Unit</label>
                    <div className="toggle-row">
                      <button className={`toggle-btn ${!useFahrenheit ? 'active' : ''}`} onClick={() => setUseFahrenheit(false)}>Celsius °C</button>
                      <button className={`toggle-btn ${useFahrenheit ? 'active' : ''}`} onClick={() => setUseFahrenheit(true)}>Fahrenheit °F</button>
                    </div>
                  </div>
                  <div className="settings-field">
                    <label>Detect Location</label>
                    <button className="location-detect-btn" onClick={detectLocationByIP}><IconGlobe /> Detect by IP</button>
                    <p className="hint">Uses your IP address to estimate location. No permission required.</p>
                  </div>
                  <div className="settings-field">
                    <label>Search City</label>
                    <div className="city-search-row">
                      <input type="text" value={manualCity} onChange={(e) => setManualCity(e.target.value)} placeholder="e.g. London, Tokyo, New York" onKeyDown={(e) => e.key === 'Enter' && searchCity()} />
                      <button className="btn-primary small" onClick={searchCity}>Search</button>
                    </div>
                    {locationCity && <p className="hint">Current: <strong>{locationCity}</strong></p>}
                  </div>
                  <div className="settings-field">
                    <label>Manual Coordinates</label>
                    <div className="coords-row">
                      <input type="number" value={lat ?? ''} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) { setLat(v); storeSet('lat', v); } }} placeholder="Latitude" step="0.01" />
                      <input type="number" value={lon ?? ''} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) { setLon(v); storeSet('lon', v); } }} placeholder="Longitude" step="0.01" />
                    </div>
                    <p className="hint">Tip: Native GPS location requires the built .app bundle. IP detection and city search work everywhere.</p>
                  </div>
                </div>
              )}

              {/* LAYOUT */}
              {settingsTab === 'layout' && (
                <div className="settings-section">
                  <h3>Layout Editor</h3>
                  <div className="settings-field">
                    <label>Mode</label>
                    <div className="toggle-row">
                      <button className={`toggle-btn ${!editLayoutMode ? 'active' : ''}`} onClick={() => { setEditLayoutMode(false); setActiveWidgetSettings(null); }}>View</button>
                      <button className={`toggle-btn ${editLayoutMode ? 'active' : ''}`} onClick={() => setEditLayoutMode(true)}>Edit</button>
                    </div>
                    <p className="hint">In Edit mode, drag elements anywhere on screen. They snap to grid lines. Press ⌘E to toggle.</p>
                  </div>
                  <div className="settings-field">
                    <label>Element Visibility</label>
                    <div className="visibility-grid">
                      {(Object.keys(visibility) as Array<keyof Visibility>).map((key) => (
                        <button key={key} className={`visibility-chip ${visibility[key] ? 'active' : ''}`} onClick={() => setVisibility((v) => ({ ...v, [key]: !v[key] }))}>
                          {visibility[key] ? <IconEye /> : <IconEyeOff />}
                          <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="settings-field">
                    <label>Actions</label>
                    <div className="preset-actions">
                      <button className="icon-text-btn" onClick={resetLayout}><IconReset /> Reset Layout</button>
                    </div>
                  </div>
                </div>
              )}

              {/* THEMES */}
              {settingsTab === 'themes' && (
                <div className="settings-section">
                  <h3>Themes</h3>
                  {activeThemeId && (
                    <div className="settings-field">
                      <label>Active Theme</label>
                      <div className="active-preset-bar">
                        <span className="active-preset-name">{themes.find((t) => t.id === activeThemeId)?.name || 'None'}</span>
                        <button className="btn-primary small" onClick={updateActiveTheme}><IconCheck /> Save to Theme</button>
                      </div>
                      <p className="hint">Click "Save to Theme" to overwrite the active theme with current settings.</p>
                    </div>
                  )}
                  <div className="settings-field">
                    <label>Saved Themes</label>
                    <div className="preset-list">
                      {themes.map((t) => (
                        <div key={t.id} className={`preset-card ${activeThemeId === t.id ? 'active' : ''}`}>
                          {renamingThemeId === t.id ? (
                            <div className="preset-rename-row">
                              <input type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmRename()} autoFocus />
                              <button className="btn-primary small" onClick={confirmRename}><IconCheck /></button>
                              <button className="btn-secondary small" onClick={() => setRenamingThemeId(null)}><IconX /></button>
                            </div>
                          ) : editingThemeId === t.id ? (
                            <div className="preset-edit-json">
                              <textarea value={editThemeJson} onChange={(e) => setEditThemeJson(e.target.value)} rows={6} />
                              <div className="preset-actions">
                                <button className="btn-primary small" onClick={confirmEditJson}><IconCheck /> Save JSON</button>
                                <button className="btn-secondary small" onClick={() => setEditingThemeId(null)}><IconX /> Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button className="preset-card-name" onClick={() => applyTheme(t)}>{t.name}</button>
                              <div className="preset-card-actions">
                                <button className="preset-card-btn" onClick={(e) => startRename(t, e)} title="Rename"><IconPencil /></button>
                                <button className="preset-card-btn" onClick={(e) => startEditJson(t, e)} title="Edit JSON"><IconSettings /></button>
                                <button className="preset-card-btn delete" onClick={(e) => deleteTheme(t.id, e)} title="Delete"><IconTrash /></button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="settings-field">
                    <label>New Theme</label>
                    {!showNewThemeInput ? (
                      <button className="preset-chip add" onClick={() => setShowNewThemeInput(true)}><IconPlus /> Save Current as Theme</button>
                    ) : (
                      <div className="new-preset-row">
                        <input type="text" value={newThemeName} onChange={(e) => setNewThemeName(e.target.value)} placeholder="Theme name..." onKeyDown={(e) => e.key === 'Enter' && confirmSaveTheme()} autoFocus />
                        <button className="btn-primary small" onClick={confirmSaveTheme}>Save</button>
                        <button className="btn-secondary small" onClick={() => { setShowNewThemeInput(false); setNewThemeName(''); }}>Cancel</button>
                      </div>
                    )}
                  </div>
                  <div className="settings-field">
                    <label>Transfer</label>
                    <div className="preset-actions">
                      <button className="icon-text-btn" onClick={openThemesFolder}><IconFolder /> Open Themes Folder</button>
                      <label className="icon-text-btn file-label">
                        <IconUpload /> Import Theme Zip
                        <input type="file" accept=".zip" style={{ display: 'none' }} onChange={async (e) => {
                          if (e.target.files?.[0]) {
                            try {
                              const file = e.target.files[0];
                              const zip = await JSZip.loadAsync(file);
                              const themeJson = await zip.file('theme.json')?.async('string');
                              const settingsJson = await zip.file('settings.json')?.async('string');
                              const customCss = await zip.file('custom.css')?.async('string');
                              if (!themeJson) { alert('theme.json not found in zip'); return; }
                              const themeColors = JSON.parse(themeJson) as ThemeColors;
                              const settings = settingsJson ? JSON.parse(settingsJson) : {};
                              const imported: SavedTheme = {
                                id: genId(),
                                name: file.name.replace(/\.zip$/i, '').replace(/[-_]/g, ' '),
                                backgroundType: settings.backgroundType || 'youtube',
                                youtubeUrl: settings.youtubeUrl || '',
                                youtubeEndTime: settings.youtubeEndTime ?? null,
                                imageUrl: settings.imageUrl || '',
                                videoUrl: settings.videoUrl || '',
                                videoPath: settings.videoPath || '',
                                use24Hour: settings.use24Hour ?? true,
                                useFahrenheit: settings.useFahrenheit ?? false,
                                autoHideEnabled: settings.autoHideEnabled ?? false,
                                autoHideDelay: settings.autoHideDelay ?? 5,
                                lat: settings.lat ?? null,
                                lon: settings.lon ?? null,
                                city: settings.city || '',
                                theme: { ...DEFAULT_THEME, ...themeColors, widgetStyles: themeColors.widgetStyles || {}, customCss: customCss ?? themeColors.customCss ?? '' },
                                positions: settings.positions || { ...DEFAULT_POSITIONS },
                                visibility: settings.visibility || { ...DEFAULT_VISIBILITY },
                              };
                              const next = [...themes, imported];
                              setThemes(next);
                              await saveThemeToFile(imported);
                            } catch { alert('Invalid theme zip file'); }
                          }
                        }} />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* THEME */}
              {settingsTab === 'theme' && (
                <div className="settings-section">
                  <h3>Theme</h3>
                  <div className="settings-field">
                    <label>Colors</label>
                    <div className="theme-grid">
                      <div className="theme-item"><span>Background</span><input type="color" value={theme.bgDeep} onChange={(e) => setTheme((t) => ({ ...t, bgDeep: e.target.value }))} /></div>
                      <div className="theme-item"><span>Accent</span><input type="color" value={theme.accent} onChange={(e) => setTheme((t) => ({ ...t, accent: e.target.value, accentHover: e.target.value }))} /></div>
                      <div className="theme-item"><span>Text</span><input type="color" value={theme.textPrimary} onChange={(e) => setTheme((t) => ({ ...t, textPrimary: e.target.value }))} /></div>
                      <div className="theme-item"><span>Glass</span><input type="color" value={theme.bgPrimary} onChange={(e) => setTheme((t) => ({ ...t, bgPrimary: e.target.value, glassBg: hexToRgba(e.target.value, 0.45) }))} /></div>
                    </div>
                  </div>
                  <div className="settings-field">
                    <label>Appearance</label>
                    <div className="theme-sliders">
                      <div className="slider-row"><span className="slider-label">Blur</span><input type="range" min="0" max="60" value={theme.panelBlur} onChange={(e) => setTheme((t) => ({ ...t, panelBlur: parseInt(e.target.value) }))} className="slider" /><span className="slider-value">{theme.panelBlur}px</span></div>
                      <div className="slider-row"><span className="slider-label">Radius</span><input type="range" min="0" max="32" value={theme.radius} onChange={(e) => setTheme((t) => ({ ...t, radius: parseInt(e.target.value) }))} className="slider" /><span className="slider-value">{theme.radius}px</span></div>
                      <div className="slider-row"><span className="slider-label">Clock</span><input type="range" min="3" max="12" step="0.5" value={parseFloat(theme.clockSize.match(/[\d.]+/)?.[0] || '5.5')} onChange={(e) => setTheme((t) => ({ ...t, clockSize: `clamp(${e.target.value}rem, ${(parseFloat(e.target.value) * 2.3).toFixed(1)}vw, ${(parseFloat(e.target.value) * 1.7).toFixed(1)}rem)` }))} className="slider" /><span className="slider-value">{theme.clockSize.match(/[\d.]+/)?.[0]}rem</span></div>
                    </div>
                  </div>
                  <div className="settings-field">
                    <label>Custom CSS</label>
                    <textarea className="custom-css-textarea" value={theme.customCss} onChange={(e) => setTheme((t) => ({ ...t, customCss: e.target.value }))} rows={6} placeholder="/* Write custom CSS here */" />
                    <p className="hint">Custom CSS is injected globally. Use selectors like [data-widget=&quot;clock&quot;] to target widgets.</p>
                  </div>
                  <div className="settings-field">
                    <label>Widget Styles</label>
                    <div className="widget-styles-list">
                      {(Object.keys(visibility) as Array<keyof Visibility>).map((key) => (
                        <div key={key} className="widget-style-card">
                          <span className="widget-style-name">{key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</span>
                          <div className="widget-style-quick">
                            <div className="widget-settings-field compact">
                              <label>Font Size</label>
                              <input type="text" value={theme.widgetStyles[key]?.fontSize || ''} placeholder="auto" onChange={(e) => updateWidgetStyle(key, { fontSize: e.target.value || undefined })} />
                            </div>
                            <div className="widget-settings-field compact">
                              <label>Scale</label>
                              <div className="slider-row">
                                <input type="range" min="0.5" max="2" step="0.05" value={theme.widgetStyles[key]?.scale ?? 1} onChange={(e) => updateWidgetStyle(key, { scale: parseFloat(e.target.value) })} className="slider" />
                                <span className="slider-value">{(theme.widgetStyles[key]?.scale ?? 1).toFixed(2)}x</span>
                              </div>
                            </div>
                            <div className="widget-settings-field compact">
                              <label>Opacity</label>
                              <div className="slider-row">
                                <input type="range" min="0" max="1" step="0.05" value={theme.widgetStyles[key]?.opacity ?? 1} onChange={(e) => updateWidgetStyle(key, { opacity: parseFloat(e.target.value) })} className="slider" />
                                <span className="slider-value">{Math.round((theme.widgetStyles[key]?.opacity ?? 1) * 100)}%</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="settings-field">
                    <label>Theme Transfer</label>
                    <div className="preset-actions">
                      <button className="icon-text-btn" onClick={openThemesFolder}><IconFolder /> Open Themes Folder</button>
                    </div>
                  </div>
                  <button className="btn-link" onClick={() => setTheme(DEFAULT_THEME)}>Reset to default theme</button>
                </div>
              )}

              <div className="settings-actions">
                <button className="btn-primary" onClick={saveSettings}>Save & Close</button>
                <button className="btn-secondary" onClick={() => setShowSettings(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
