import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { open as openUrl } from '@tauri-apps/plugin-shell';
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
  borderWidth?: number;
  background?: string;
  borderColor?: string;
  backdropBlur?: number;
  fontWeight?: number;
  letterSpacing?: string;
  textShadow?: string;
  lineHeight?: string;
  textTransform?: string;
  customCss?: string;
}

interface ThemeColors {
  bgDeep: string; bgPrimary: string; bgSecondary: string;
  textPrimary: string; textSecondary: string; textDim: string;
  accent: string; accentHover: string;
  glassBg: string; glassBorder: string;
  panelBlur: number; clockSize: string; radius: number;
  bgOverlayOpacity: number; bgOverlayBlur: number;
  fontFamily: string; fontSizeBase: string;
  widgetGap: string; widgetPadding: string;
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
  bgOverlayOpacity: 0, bgOverlayBlur: 0,
  fontFamily: '', fontSizeBase: '',
  widgetGap: '', widgetPadding: '',
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
  // Minimal — ultra clean, only clock + date visible
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

  // Aurora — ethereal northern lights with floating glass
  makeDefaultTheme('Aurora', {
    bgDeep: '#0a0a1a', bgPrimary: '#0d1b2a', bgSecondary: '#1b2838',
    textPrimary: '#e0f7fa', textSecondary: '#80deea', textDim: '#4db6ac',
    accent: '#00e5ff', accentHover: '#18ffff',
    glassBg: 'rgba(0, 229, 255, 0.06)', glassBorder: 'rgba(0, 229, 255, 0.15)',
    panelBlur: 32, radius: 24,
    bgOverlayOpacity: 0.3, bgOverlayBlur: 8,
    widgetStyles: {
      clock: {
        fontSize: 'clamp(6rem, 14vw, 10rem)',
        fontWeight: 100,
        textShadow: '0 0 40px rgba(0, 229, 255, 0.3), 0 0 80px rgba(0, 229, 255, 0.1)',
        letterSpacing: '-0.04em',
        backdropBlur: 0,
        background: 'transparent',
        borderColor: 'transparent',
        padding: '0',
      },
      date: {
        fontSize: '1rem',
        fontWeight: 300,
        letterSpacing: '0.3em',
        textTransform: 'uppercase',
        textShadow: '0 0 20px rgba(0, 229, 255, 0.2)',
        background: 'transparent',
        borderColor: 'transparent',
        padding: '0',
      },
      weather: {
        borderRadius: 20,
        backdropBlur: 40,
        background: 'rgba(0, 229, 255, 0.04)',
        borderColor: 'rgba(0, 229, 255, 0.2)',
        padding: '16px 24px',
      },
    },
    customCss: `
      .clock-hours, .clock-minutes { font-weight: 100; }
      .clock-sep { opacity: 0.4; animation: none; }
      .glass-panel { border-width: 0.5px; }
      [data-widget="clock"] { transform: translate(-50%, -50%) !important; }
    `,
  }, {
    positions: {
      weather: { x: 50, y: 8 }, calendar: { x: 50, y: 15 },
      settingsButtons: { x: 50, y: 92 }, clock: { x: 50, y: 42 },
      date: { x: 50, y: 58 }, nowPlaying: { x: 50, y: 85 },
      timer: { x: 85, y: 85 },
    },
    visibility: {
      weather: true, calendar: true, settingsButtons: true,
      clock: true, date: true, nowPlaying: true, timer: false,
    },
  }),

  // Brutalist — raw, bold, no glass
  makeDefaultTheme('Brutalist', {
    bgDeep: '#f5f5f0', bgPrimary: '#ffffff', bgSecondary: '#e8e8e0',
    textPrimary: '#111111', textSecondary: '#444444', textDim: '#888888',
    accent: '#ff3300', accentHover: '#ff5500',
    glassBg: 'rgba(255, 255, 255, 0.9)', glassBorder: '#111111',
    panelBlur: 0, radius: 0,
    bgOverlayOpacity: 0, bgOverlayBlur: 0,
    widgetStyles: {
      clock: {
        fontSize: 'clamp(7rem, 16vw, 12rem)',
        fontWeight: 900,
        letterSpacing: '-0.06em',
        background: 'transparent',
        borderColor: 'transparent',
        padding: '0',
        textShadow: 'none',
      },
      date: {
        fontSize: '1.2rem',
        fontWeight: 700,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        background: '#111111',
        color: '#ffffff',
        padding: '8px 20px',
        borderRadius: 0,
      },
      weather: {
        borderRadius: 0,
        borderWidth: 3,
        background: '#ffffff',
        borderColor: '#111111',
        padding: '16px 24px',
        backdropBlur: 0,
      },
      calendar: {
        borderRadius: 0,
        borderWidth: 3,
        background: '#ffffff',
        borderColor: '#111111',
        padding: '12px 20px',
        backdropBlur: 0,
      },
      settingsButtons: {
        background: 'transparent',
        borderColor: 'transparent',
        backdropBlur: 0,
      },
    },
    customCss: `
      .glass-panel { box-shadow: 8px 8px 0 #111111; border-radius: 0; }
      .glass-icon-btn { border-radius: 0; border: 2px solid #111; box-shadow: 4px 4px 0 #111; }
      .glass-icon-btn:hover { box-shadow: 2px 2px 0 #111; transform: translate(2px, 2px); }
      .clock-sep { animation: none; opacity: 1; }
      .clock-hours, .clock-minutes { font-weight: 900; }
      .date-text { border-radius: 0; }
    `,
  }, {
    positions: {
      weather: { x: 8, y: 8 }, calendar: { x: 8, y: 20 },
      settingsButtons: { x: 92, y: 8 }, clock: { x: 50, y: 45 },
      date: { x: 50, y: 60 }, nowPlaying: { x: 8, y: 90 },
      timer: { x: 92, y: 90 },
    },
    visibility: {
      weather: true, calendar: true, settingsButtons: true,
      clock: true, date: true, nowPlaying: true, timer: true,
    },
  }),

  // Vaporwave — retro 80s neon grid
  makeDefaultTheme('Vaporwave', {
    bgDeep: '#1a0a2e', bgPrimary: '#2d1b4e', bgSecondary: '#3d2b5e',
    textPrimary: '#ff71ce', textSecondary: '#01cdfe', textDim: '#b967ff',
    accent: '#fffb96', accentHover: '#ffe156',
    glassBg: 'rgba(45, 27, 78, 0.5)', glassBorder: 'rgba(255, 113, 206, 0.2)',
    panelBlur: 20, radius: 8,
    bgOverlayOpacity: 0.2, bgOverlayBlur: 2,
    widgetStyles: {
      clock: {
        fontSize: 'clamp(5rem, 12vw, 8rem)',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textShadow: '0 0 20px rgba(255, 113, 206, 0.6), 0 0 40px rgba(255, 113, 206, 0.3), 2px 2px 0 #01cdfe',
        background: 'transparent',
        borderColor: 'transparent',
        padding: '0',
      },
      date: {
        fontSize: '0.95rem',
        fontWeight: 600,
        letterSpacing: '0.25em',
        textTransform: 'uppercase',
        textShadow: '0 0 10px rgba(1, 205, 254, 0.5)',
        color: '#01cdfe',
        background: 'transparent',
        borderColor: 'transparent',
        padding: '0',
      },
      weather: {
        borderRadius: 8,
        backdropBlur: 24,
        background: 'rgba(45, 27, 78, 0.6)',
        borderColor: 'rgba(255, 113, 206, 0.3)',
        padding: '14px 20px',
      },
      calendar: {
        borderRadius: 8,
        backdropBlur: 24,
        background: 'rgba(45, 27, 78, 0.6)',
        borderColor: 'rgba(1, 205, 254, 0.2)',
        padding: '10px 18px',
      },
    },
    customCss: `
      .clock-hours, .clock-minutes { font-weight: 700; }
      .clock-sep { animation: none; opacity: 0.8; color: #fffb96; }
      .glass-panel { box-shadow: 0 0 15px rgba(255, 113, 206, 0.15); }
      .glass-icon-btn { border-radius: 8px; }
      .glass-icon-btn:hover { box-shadow: 0 0 12px rgba(255, 113, 206, 0.4); }
      .preset-btn.active { background: #ff71ce; border-color: #ff71ce; }
    `,
  }, {
    positions: {
      weather: { x: 12, y: 12 }, calendar: { x: 88, y: 12 },
      settingsButtons: { x: 50, y: 90 }, clock: { x: 50, y: 38 },
      date: { x: 50, y: 52 }, nowPlaying: { x: 12, y: 88 },
      timer: { x: 88, y: 88 },
    },
    visibility: {
      weather: true, calendar: true, settingsButtons: true,
      clock: true, date: true, nowPlaying: true, timer: true,
    },
  }),

  // Zen — Japanese-inspired, vertical layout, ultra minimal
  makeDefaultTheme('Zen', {
    bgDeep: '#1c1c1e', bgPrimary: '#2c2c2e', bgSecondary: '#3a3a3c',
    textPrimary: '#f5f5f7', textSecondary: '#a1a1a6', textDim: '#636366',
    accent: '#d4a574', accentHover: '#c49464',
    glassBg: 'rgba(44, 44, 46, 0.4)', glassBorder: 'rgba(212, 165, 116, 0.1)',
    panelBlur: 16, radius: 4,
    bgOverlayOpacity: 0.4, bgOverlayBlur: 4,
    widgetStyles: {
      clock: {
        fontSize: 'clamp(4rem, 10vw, 7rem)',
        fontWeight: 300,
        letterSpacing: '0.12em',
        textShadow: 'none',
        background: 'transparent',
        borderColor: 'transparent',
        padding: '0',
      },
      date: {
        fontSize: '0.85rem',
        fontWeight: 400,
        letterSpacing: '0.4em',
        textTransform: 'uppercase',
        color: '#d4a574',
        background: 'transparent',
        borderColor: 'transparent',
        padding: '0',
      },
      weather: {
        borderRadius: 4,
        backdropBlur: 16,
        background: 'rgba(44, 44, 46, 0.5)',
        borderColor: 'rgba(212, 165, 116, 0.15)',
        padding: '12px 18px',
        fontSize: '0.85rem',
      },
      calendar: {
        borderRadius: 4,
        backdropBlur: 16,
        background: 'rgba(44, 44, 46, 0.5)',
        borderColor: 'rgba(212, 165, 116, 0.1)',
        padding: '10px 16px',
        fontSize: '0.8rem',
      },
      settingsButtons: {
        background: 'transparent',
        borderColor: 'transparent',
        backdropBlur: 0,
      },
    },
    customCss: `
      .clock-hours, .clock-minutes { font-weight: 300; }
      .clock-sep { animation: none; opacity: 0.3; }
      .glass-panel { border-width: 0.5px; }
      .glass-icon-btn { width: 36px; height: 36px; border-radius: 4px; }
      .date-text { letter-spacing: 0.4em; }
    `,
  }, {
    positions: {
      weather: { x: 50, y: 6 }, calendar: { x: 50, y: 14 },
      settingsButtons: { x: 50, y: 94 }, clock: { x: 50, y: 40 },
      date: { x: 50, y: 54 }, nowPlaying: { x: 50, y: 86 },
      timer: { x: 90, y: 86 },
    },
    visibility: {
      weather: true, calendar: true, settingsButtons: true,
      clock: true, date: true, nowPlaying: true, timer: false,
    },
  }),

  // Neon — cyberpunk with glowing borders
  makeDefaultTheme('Neon', {
    bgDeep: '#0a0a0a', bgPrimary: '#111111', bgSecondary: '#1a1a1a',
    textPrimary: '#ffffff', textSecondary: '#00ff88', textDim: '#00ff88',
    accent: '#ff0066', accentHover: '#ff3388',
    glassBg: 'rgba(0, 0, 0, 0.7)', glassBorder: 'rgba(255, 0, 102, 0.3)',
    panelBlur: 8, radius: 2,
    bgOverlayOpacity: 0.5, bgOverlayBlur: 6,
    widgetStyles: {
      clock: {
        fontSize: 'clamp(6rem, 15vw, 11rem)',
        fontWeight: 800,
        letterSpacing: '-0.03em',
        textShadow: '0 0 30px rgba(255, 0, 102, 0.5), 0 0 60px rgba(255, 0, 102, 0.2)',
        background: 'transparent',
        borderColor: 'transparent',
        padding: '0',
      },
      date: {
        fontSize: '1rem',
        fontWeight: 600,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        textShadow: '0 0 15px rgba(0, 255, 136, 0.4)',
        color: '#00ff88',
        background: 'transparent',
        borderColor: 'transparent',
        padding: '0',
      },
      weather: {
        borderRadius: 2,
        backdropBlur: 8,
        background: 'rgba(0, 0, 0, 0.8)',
        borderColor: 'rgba(0, 255, 136, 0.3)',
        padding: '14px 20px',
        color: '#00ff88',
      },
      calendar: {
        borderRadius: 2,
        backdropBlur: 8,
        background: 'rgba(0, 0, 0, 0.8)',
        borderColor: 'rgba(0, 255, 136, 0.2)',
        padding: '10px 16px',
        color: '#00ff88',
      },
      settingsButtons: {
        background: 'transparent',
        borderColor: 'transparent',
        backdropBlur: 0,
      },
    },
    customCss: `
      .clock-hours, .clock-minutes { font-weight: 800; }
      .clock-sep { animation: none; opacity: 0.6; color: #ff0066; }
      .glass-panel { box-shadow: 0 0 20px rgba(255, 0, 102, 0.1), inset 0 0 20px rgba(255, 0, 102, 0.05); }
      .glass-icon-btn { border-radius: 2px; border: 1px solid rgba(255, 0, 102, 0.3); }
      .glass-icon-btn:hover { box-shadow: 0 0 15px rgba(255, 0, 102, 0.4); border-color: #ff0066; }
      .preset-btn.active { background: #ff0066; box-shadow: 0 0 10px rgba(255, 0, 102, 0.5); }
    `,
  }, {
    positions: {
      weather: { x: 10, y: 10 }, calendar: { x: 90, y: 10 },
      settingsButtons: { x: 10, y: 90 }, clock: { x: 50, y: 42 },
      date: { x: 50, y: 56 }, nowPlaying: { x: 90, y: 90 },
      timer: { x: 50, y: 90 },
    },
    visibility: {
      weather: true, calendar: true, settingsButtons: true,
      clock: true, date: true, nowPlaying: true, timer: true,
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
const IconThemes     = () => <Ico d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69z" />;
const IconLayout     = () => <Ico d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />;
const IconMove       = () => <Ico d="M5 9l4-4 4 4M9 5v14" />;
const IconEye        = () => <Ico d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />;
const IconEyeOff     = () => <Ico d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />;
const IconPencil     = () => <Ico d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />;
const IconCheck      = () => <Ico d="M20 6L9 17l-5-5" />;
const IconX          = () => <Ico d="M18 6L6 18M6 6l12 12" />;
const IconGlobe      = () => <Ico d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 0 1 0-16 8 8 0 0 1 0 16zM2 12h20" />;
const IconLocation   = () => <Ico d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />;
const IconLock       = () => <Ico d="M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4" />;
const IconCalendar   = () => <Ico d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM16 2v4M8 2v4M3 10h18" />;
const IconMusic      = () => <Ico d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />;
const IconTimer      = () => <Ico d="M10 2h4M12 14l3-3M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />;
const IconPause      = () => <Ico d="M6 4h4v16H6zM14 4h4v16h-4z" />;
const IconPlay       = () => <Ico d="M5 3l14 9-14 9V3z" />;
const IconReset      = () => <Ico d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />;
const IconTrash      = () => <Ico d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />;
const IconUpload     = () => <Ico d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />;
const IconPlus       = () => <Ico d="M12 5v14M5 12h14" />;
const IconGeneral    = () => <Ico d="M12 20h9M12 20V4m0 0H3m9 0v16" />;
const IconPalette    = () => <Ico d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69z" />;
const IconBg         = () => <Ico d="M4 16l4.586-4.586a2 2 0 0 1 2.828 0L16 16m-2-2l1.586-1.586a2 2 0 0 1 2.828 0L20 14m-6-6h.01M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />;
const IconWeatherIco = () => <Ico d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9" />;
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
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const [widgetScales, setWidgetScales] = useState<Record<string, number>>({});
  const resizeRef = useRef<{ key: string; handle: string; rect: DOMRect; unscaledW: number; unscaledH: number } | null>(null);
  const resizeOverlayRef = useRef<HTMLDivElement>(null);

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

  /* --- settings --- */
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'appearance' | 'background' | 'weather' | 'layout' | 'themes'>('general');
  const [settingsPos, setSettingsPos] = useState({ x: 60, y: 40 });
  const settingsDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

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
    r.style.setProperty('--overlay-opacity', String(theme.bgOverlayOpacity));
    r.style.setProperty('--overlay-blur', `${theme.bgOverlayBlur}px`);
    if (theme.fontFamily) r.style.setProperty('--font-body', theme.fontFamily);
    if (theme.fontSizeBase) r.style.setProperty('--font-size-base', theme.fontSizeBase);
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
      if (s.textTransform) css += `${text} { text-transform: ${s.textTransform} !important; }\n`;
      if (s.padding) css += `${inner} { padding: ${s.padding} !important; }\n`;
      if (s.gap) css += `${inner} { gap: ${s.gap} !important; }\n`;
      if (s.borderRadius !== undefined) css += `${inner} { border-radius: ${s.borderRadius}px !important; }\n`;
      if (s.borderWidth !== undefined) css += `${inner} { border-width: ${s.borderWidth}px !important; }\n`;
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
      DRAGGABLE SETTINGS WINDOW
      ========================================================== */
  const startSettingsDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    settingsDragRef.current = { startX: e.clientX, startY: e.clientY, origX: settingsPos.x, origY: settingsPos.y };
    const onMove = (ev: MouseEvent) => {
      if (!settingsDragRef.current) return;
      const dx = ev.clientX - settingsDragRef.current.startX;
      const dy = ev.clientY - settingsDragRef.current.startY;
      setSettingsPos({ x: settingsDragRef.current.origX + dx, y: settingsDragRef.current.origY + dy });
    };
    const onUp = () => {
      settingsDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
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

  const updateResizeOverlay = useCallback((widgetKey: string) => {
    const widgetEl = document.querySelector(`[data-widget="${widgetKey}"]`) as HTMLElement | null;
    const overlayEl = resizeOverlayRef.current;
    const contentEl = contentRef.current;
    if (!widgetEl || !overlayEl || !contentEl) return;
    const wRect = widgetEl.getBoundingClientRect();
    const cRect = contentEl.getBoundingClientRect();
    overlayEl.style.left = `${wRect.left - cRect.left}px`;
    overlayEl.style.top = `${wRect.top - cRect.top}px`;
    overlayEl.style.width = `${wRect.width}px`;
    overlayEl.style.height = `${wRect.height}px`;
  }, []);

  useEffect(() => {
    if (!editLayoutMode || !selectedWidget) return;
    let rafId = 0;
    const sync = () => {
      updateResizeOverlay(selectedWidget);
      rafId = requestAnimationFrame(sync);
    };
    rafId = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(rafId);
  }, [editLayoutMode, selectedWidget, widgetScales, updateResizeOverlay]);

  const startResize = (e: React.MouseEvent, key: string, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    const el = document.querySelector(`[data-widget="${key}"]`) as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const currentScale = widgetScales[key] || 1;
    const unscaledW = rect.width / currentScale;
    const unscaledH = rect.height / currentScale;
    resizeRef.current = { key, handle, rect, unscaledW, unscaledH };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const { rect: r, unscaledW: w0, unscaledH: h0 } = resizeRef.current;
      const centerX = r.left + r.width / 2;
      const centerY = r.top + r.height / 2;
      const dx = ev.clientX - centerX;
      const dy = ev.clientY - centerY;
      const cursorDist = Math.sqrt(dx * dx + dy * dy);
      const origHalfDiag = Math.sqrt(w0 * w0 + h0 * h0) / 2;
      const newScale = Math.max(0.3, Math.min(3, cursorDist / origHalfDiag));
      setWidgetScales((prev) => ({ ...prev, [key]: newScale }));
    };
    const onUp = () => {
      resizeRef.current = null;
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
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowSettings(false); setEditLayoutMode(false); setActiveWidgetSettings(null); }
      if (e.metaKey || e.ctrlKey) {
        if (e.key === ',') { e.preventDefault(); setShowSettings((s) => !s); }
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
   const tabs: { id: 'general' | 'appearance' | 'background' | 'weather' | 'layout' | 'themes'; label: string; icon: React.ReactNode }[] = [
     { id: 'general', label: 'General', icon: <IconGeneral /> },
     { id: 'appearance', label: 'Appearance', icon: <IconPalette /> },
     { id: 'background', label: 'Background', icon: <IconBg /> },
     { id: 'weather', label: 'Weather', icon: <IconWeatherIco /> },
     { id: 'layout', label: 'Layout', icon: <IconLayout /> },
     { id: 'themes', label: 'Themes', icon: <IconThemes /> },
   ];
  const visibleTabs = tabs;

  /* ==========================================================
     RENDER WIDGET WRAPPER
     ========================================================== */
  const renderWidget = (widgetKey: string, children: React.ReactNode, className = '') => {
    const pos = positions[widgetKey] || DEFAULT_POSITIONS[widgetKey];
    const vis = visibility[widgetKey as keyof Visibility];
    if (!vis) return null;
    const inline = getWidgetInlineStyle(widgetKey);
    const isEditing = activeWidgetSettings === widgetKey;
    const isSelected = selectedWidget === widgetKey;
    const ws = theme.widgetStyles[widgetKey] || {};
    const scale = widgetScales[widgetKey];

    return (
      <div
        key={widgetKey}
        data-widget={widgetKey}
        className={`widget-wrapper ${editLayoutMode ? 'edit-mode' : ''} ${isSelected ? 'selected' : ''} ${uiHidden && widgetKey !== 'clock' && widgetKey !== 'date' && widgetKey !== 'weather' ? 'ui-hideable' : ''} ${className}`}
        style={{ left: `${pos.x}%`, top: `${pos.y}%`, ...inline, transform: `translate(-50%, -50%)${scale ? ` scale(${scale})` : ''}` }}
        onMouseDown={(e) => { if (editLayoutMode) { e.stopPropagation(); setSelectedWidget(widgetKey); startDrag(e, widgetKey); } }}
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
        {isSelected && editLayoutMode && (
          <>
            <div className="resize-handle resize-nw" onMouseDown={(e) => startResize(e, widgetKey, 'nw')} />
            <div className="resize-handle resize-ne" onMouseDown={(e) => startResize(e, widgetKey, 'ne')} />
            <div className="resize-handle resize-sw" onMouseDown={(e) => startResize(e, widgetKey, 'sw')} />
            <div className="resize-handle resize-se" onMouseDown={(e) => startResize(e, widgetKey, 'se')} />
          </>
        )}
        {isEditing && editLayoutMode && (
          <div className="widget-settings-popover" ref={widgetSettingsRef} onClick={(e) => e.stopPropagation()}>
            <div className="widget-settings-header">
              <span>{widgetKey.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</span>
              <button className="widget-settings-close" onClick={() => setActiveWidgetSettings(null)}><IconX /></button>
            </div>
            <div className="widget-settings-body">
              <div className="widget-settings-field">
                <label>Color</label>
                <div className="color-row">
                  <input type="color" value={ws.color || theme.textPrimary} onChange={(e) => updateWidgetStyle(widgetKey, { color: e.target.value })} />
                  <input type="text" value={ws.color || ''} onChange={(e) => updateWidgetStyle(widgetKey, { color: e.target.value || undefined })} className="color-text" placeholder="inherit" />
                </div>
              </div>
              <div className="widget-settings-field">
                <label>Font Size</label>
                <input type="text" value={ws.fontSize || ''} onChange={(e) => updateWidgetStyle(widgetKey, { fontSize: e.target.value || undefined })} placeholder="e.g. 1.2rem or 24px" />
              </div>
              {widgetKey === 'clock' && (
                <div className="widget-settings-field">
                  <label>Clock Animation</label>
                  <div className="toggle-row">
                    <button className={`toggle-btn ${(!ws.textShadow || !ws.textShadow.includes('glow')) ? 'active' : ''}`} onClick={() => updateWidgetStyle(widgetKey, { textShadow: undefined })}>None</button>
                    <button className={`toggle-btn ${ws.textShadow?.includes('glow') ? 'active' : ''}`} onClick={() => updateWidgetStyle(widgetKey, { textShadow: '0 0 20px rgba(255,255,255,0.15)' })}>Glow</button>
                  </div>
                </div>
              )}
              <button className="btn-link small" onClick={() => updateWidgetStyle(widgetKey, {})}>Reset</button>
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
    <div className={`app ${uiHidden ? 'ui-hidden' : ''}`}>
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
        {renderWidget("weather",
          weather && displayTemp ? (
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
          )
        )}

        {/* Calendar */}
        {renderWidget("calendar",
          calendarEvent && (
            <div className="glass-panel calendar-widget">
              <IconCalendar />
              <span className="calendar-text">{calendarEvent}</span>
            </div>
          )
        )}

        {/* Settings Buttons */}
        {renderWidget("settingsButtons",
          <div className="settings-buttons-row">
            <button className="glass-icon-btn" onClick={() => { setEditLayoutMode((m) => !m); setActiveWidgetSettings(null); }} title="Toggle Layout Editor (⌘E)">
              {editLayoutMode ? <IconCheck /> : <IconLayout />}
            </button>
            <button className="glass-icon-btn" onClick={() => setShowSettings((s) => !s)} title="Settings (⌘,)">
              <IconSettings />
            </button>
          </div>
        )}

        {/* Clock */}
        {renderWidget("clock",
          <div className="clock">
            <span className="clock-hours">{formattedTime.hours}</span>
            <span className="clock-sep">:</span>
            <span className="clock-minutes">{formattedTime.minutes}</span>
            <span className="clock-sep">:</span>
            <span className="clock-seconds">{formattedTime.seconds}</span>
            {!use24Hour && <span className="clock-ampm">{formattedTime.ampm}</span>}
          </div>
        )}

        {/* Date */}
        {renderWidget("date",
          <div className="date-text">{formattedDate}</div>
        )}

        {/* Now Playing */}
        {renderWidget("nowPlaying",
          nowPlaying && (
            <div className="glass-panel now-playing-widget">
              <IconMusic />
              <span className="np-text">{nowPlaying}</span>
            </div>
          )
        )}

        {/* Timer */}
        {renderWidget("timer",
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
        )}

        {/* Resize Overlay */}
        {editLayoutMode && selectedWidget && (
          <div className="resize-overlay" ref={resizeOverlayRef}>
            <div className="resize-handle resize-nw" onMouseDown={(e) => startResize(e, selectedWidget, 'nw')} />
            <div className="resize-handle resize-ne" onMouseDown={(e) => startResize(e, selectedWidget, 'ne')} />
            <div className="resize-handle resize-sw" onMouseDown={(e) => startResize(e, selectedWidget, 'sw')} />
            <div className="resize-handle resize-se" onMouseDown={(e) => startResize(e, selectedWidget, 'se')} />
          </div>
        )}
      </div>

      {/* Draggable Settings Window */}
      {showSettings && (
        <div
          className="settings-window"
          style={{ left: settingsPos.x, top: settingsPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="settings-window-titlebar" onMouseDown={startSettingsDrag}>
            <span>Settings</span>
            <button className="settings-window-close" onClick={() => setShowSettings(false)}><IconX /></button>
          </div>
          <div className="settings-window-body">
            <nav className="settings-window-tabs">
              {visibleTabs.map((tab) => (
                <button key={tab.id} className={`settings-window-tab ${settingsTab === tab.id ? 'active' : ''}`} onClick={() => setSettingsTab(tab.id)} title={tab.label}>
                  {tab.icon}
                </button>
              ))}
            </nav>
            <div className="settings-window-content">
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

                  <div className="settings-field">
                    <label>Browse Wallpapers</label>
                    <div className="wallpaper-grid">
                      <button className="wallpaper-card" onClick={() => openUrl('https://motionbgs.com/tag:nature/')}>
                        <span className="wallpaper-card-emoji">🌿</span>
                        <span className="wallpaper-card-label">Nature</span>
                      </button>
                      <button className="wallpaper-card" onClick={() => openUrl('https://motionbgs.com/tag:space/')}>
                        <span className="wallpaper-card-emoji">🌌</span>
                        <span className="wallpaper-card-label">Space</span>
                      </button>
                      <button className="wallpaper-card" onClick={() => openUrl('https://motionbgs.com/tag:cyberpunk/')}>
                        <span className="wallpaper-card-emoji">🌃</span>
                        <span className="wallpaper-card-label">Cyberpunk</span>
                      </button>
                      <button className="wallpaper-card" onClick={() => openUrl('https://motionbgs.com/tag:rain/')}>
                        <span className="wallpaper-card-emoji">🌧️</span>
                        <span className="wallpaper-card-label">Rain</span>
                      </button>
                      <button className="wallpaper-card" onClick={() => openUrl('https://motionbgs.com/tag:anime/')}>
                        <span className="wallpaper-card-emoji">🎌</span>
                        <span className="wallpaper-card-label">Anime</span>
                      </button>
                      <button className="wallpaper-card" onClick={() => openUrl('https://motionbgs.com/tag:car/')}>
                        <span className="wallpaper-card-emoji">🏎️</span>
                        <span className="wallpaper-card-label">Cars</span>
                      </button>
                      <button className="wallpaper-card" onClick={() => openUrl('https://motionbgs.com/tag:games/')}>
                        <span className="wallpaper-card-emoji">🎮</span>
                        <span className="wallpaper-card-label">Games</span>
                      </button>
                      <button className="wallpaper-card" onClick={() => openUrl('https://motionbgs.com/4k/')}>
                        <span className="wallpaper-card-emoji">✨</span>
                        <span className="wallpaper-card-label">All 4K</span>
                      </button>
                    </div>
                    <p className="hint">Browse 8900+ free animated wallpapers on motionbgs.com. Copy a video URL and paste it above.</p>
                  </div>
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

              {/* APPEARANCE */}
              {settingsTab === 'appearance' && (
                <div className="settings-section">
                  <h3>Appearance</h3>

                  <div className="settings-field">
                    <label>Background</label>
                    <div className="color-row">
                      <input type="color" value={theme.bgDeep} onChange={(e) => setTheme((t) => ({ ...t, bgDeep: e.target.value }))} />
                      <input type="text" value={theme.bgDeep} onChange={(e) => setTheme((t) => ({ ...t, bgDeep: e.target.value }))} className="color-text" />
                    </div>
                  </div>

                  <div className="settings-field">
                    <label>Panel Colors</label>
                    <div className="color-grid">
                      <div className="color-item">
                        <span>Panel BG</span>
                        <input type="color" value={theme.bgPrimary} onChange={(e) => setTheme((t) => ({ ...t, bgPrimary: e.target.value, glassBg: hexToRgba(e.target.value, 0.45) }))} />
                        <input type="text" value={theme.bgPrimary} onChange={(e) => setTheme((t) => ({ ...t, bgPrimary: e.target.value }))} className="color-text" />
                      </div>
                      <div className="color-item">
                        <span>Panel Alt</span>
                        <input type="color" value={theme.bgSecondary} onChange={(e) => setTheme((t) => ({ ...t, bgSecondary: e.target.value }))} />
                        <input type="text" value={theme.bgSecondary} onChange={(e) => setTheme((t) => ({ ...t, bgSecondary: e.target.value }))} className="color-text" />
                      </div>
                    </div>
                  </div>

                  <div className="settings-field">
                    <label>Glass</label>
                    <div className="color-grid">
                      <div className="color-item">
                        <span>Background</span>
                        <input type="text" value={theme.glassBg} onChange={(e) => setTheme((t) => ({ ...t, glassBg: e.target.value }))} className="color-text full" />
                      </div>
                      <div className="color-item">
                        <span>Border</span>
                        <input type="text" value={theme.glassBorder} onChange={(e) => setTheme((t) => ({ ...t, glassBorder: e.target.value }))} className="color-text full" />
                      </div>
                    </div>
                  </div>

                  <div className="settings-field">
                    <label>Text</label>
                    <div className="color-grid">
                      <div className="color-item">
                        <span>Primary</span>
                        <input type="color" value={theme.textPrimary} onChange={(e) => setTheme((t) => ({ ...t, textPrimary: e.target.value }))} />
                        <input type="text" value={theme.textPrimary} onChange={(e) => setTheme((t) => ({ ...t, textPrimary: e.target.value }))} className="color-text" />
                      </div>
                      <div className="color-item">
                        <span>Secondary</span>
                        <input type="color" value={theme.textSecondary} onChange={(e) => setTheme((t) => ({ ...t, textSecondary: e.target.value }))} />
                        <input type="text" value={theme.textSecondary} onChange={(e) => setTheme((t) => ({ ...t, textSecondary: e.target.value }))} className="color-text" />
                      </div>
                    </div>
                  </div>

                  <div className="settings-field">
                    <label>Accent</label>
                    <div className="color-grid">
                      <div className="color-item">
                        <span>Color</span>
                        <input type="color" value={theme.accent} onChange={(e) => setTheme((t) => ({ ...t, accent: e.target.value }))} />
                        <input type="text" value={theme.accent} onChange={(e) => setTheme((t) => ({ ...t, accent: e.target.value }))} className="color-text" />
                      </div>
                      <div className="color-item">
                        <span>Hover</span>
                        <input type="color" value={theme.accentHover} onChange={(e) => setTheme((t) => ({ ...t, accentHover: e.target.value }))} />
                        <input type="text" value={theme.accentHover} onChange={(e) => setTheme((t) => ({ ...t, accentHover: e.target.value }))} className="color-text" />
                      </div>
                    </div>
                  </div>

                  <div className="settings-field">
                    <label>Background Overlay</label>
                    <div className="theme-sliders">
                      <div className="slider-row"><span className="slider-label">Opacity</span><input type="range" min="0" max="1" step="0.05" value={theme.bgOverlayOpacity} onChange={(e) => setTheme((t) => ({ ...t, bgOverlayOpacity: parseFloat(e.target.value) }))} className="slider" /><span className="slider-value">{Math.round(theme.bgOverlayOpacity * 100)}%</span></div>
                      <div className="slider-row"><span className="slider-label">Blur</span><input type="range" min="0" max="20" value={theme.bgOverlayBlur} onChange={(e) => setTheme((t) => ({ ...t, bgOverlayBlur: parseInt(e.target.value) }))} className="slider" /><span className="slider-value">{theme.bgOverlayBlur}px</span></div>
                    </div>
                  </div>

                  <div className="settings-field">
                    <label>Panel</label>
                    <div className="theme-sliders">
                      <div className="slider-row"><span className="slider-label">Blur</span><input type="range" min="0" max="60" value={theme.panelBlur} onChange={(e) => setTheme((t) => ({ ...t, panelBlur: parseInt(e.target.value) }))} className="slider" /><span className="slider-value">{theme.panelBlur}px</span></div>
                      <div className="slider-row"><span className="slider-label">Radius</span><input type="range" min="0" max="40" value={theme.radius} onChange={(e) => setTheme((t) => ({ ...t, radius: parseInt(e.target.value) }))} className="slider" /><span className="slider-value">{theme.radius}px</span></div>
                      <div className="slider-row"><span className="slider-label">Clock</span><input type="range" min="3" max="12" step="0.5" value={parseFloat(theme.clockSize.match(/[\d.]+/)?.[0] || '5.5')} onChange={(e) => setTheme((t) => ({ ...t, clockSize: `clamp(${e.target.value}rem, ${(parseFloat(e.target.value) * 2.3).toFixed(1)}vw, ${(parseFloat(e.target.value) * 1.7).toFixed(1)}rem)` }))} className="slider" /><span className="slider-value">{theme.clockSize.match(/[\d.]+/)?.[0]}rem</span></div>
                    </div>
                  </div>

                  <button className="btn-link" onClick={() => setTheme(DEFAULT_THEME)}>Reset theme</button>
                </div>
              )}

              <div className="settings-window-actions">
                <button className="btn-primary" onClick={saveSettings}>Save</button>
                <button className="btn-secondary" onClick={() => setShowSettings(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
