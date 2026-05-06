/**
 * Persistent key-value store backed by a file on disk.
 * Replaces localStorage so data survives app restarts, reinstalls,
 * and changes to the webview origin (localhost port, etc.).
 */

import { Store } from '@tauri-apps/plugin-store';

const STORE_FILE = 'wokyis-store.json';
let store: Store | null = null;
let storeReady = false;

async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load(STORE_FILE);
    storeReady = true;
  }
  return store;
}

export async function storeSet<T>(key: string, value: T): Promise<void> {
  const s = await getStore();
  await s.set(key, value);
  await s.save();
}

export async function storeGet<T>(key: string): Promise<T | null> {
  const s = await getStore();
  const val = await s.get<T>(key);
  return val ?? null;
}

export async function storeDelete(key: string): Promise<void> {
  const s = await getStore();
  await s.delete(key);
  await s.save();
}

export async function storeHas(key: string): Promise<boolean> {
  const s = await getStore();
  return await s.has(key);
}

/** Migrate data from localStorage into the file store on first run. */
export async function migrateFromLocalStorage(): Promise<void> {
  const s = await getStore();
  const migrated = await s.get<boolean>('__migrated_from_localstorage');
  if (migrated) return;

  const keys = [
    'wokyis_presets',
    'wokyis_active_preset',
    'backgroundType',
    'youtubeUrl',
    'youtubeEndTime',
    'imageUrl',
    'use24Hour',
    'useFahrenheit',
    'autoHideEnabled',
    'autoHideDelay',
    'lat',
    'lon',
    'locationCity',
    'theme',
    'positions',
    'visibility',
    'timerSeconds',
    'timerTotal',
  ];

  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      // Try to parse as JSON; fall back to string
      try {
        const parsed = JSON.parse(raw);
        await s.set(key, parsed);
      } catch {
        await s.set(key, raw);
      }
    }
  }

  await s.set('__migrated_from_localstorage', true);
  await s.save();
}

/** For the rare case where store isn't ready yet (e.g. SSR), return null synchronously. */
export function isStoreReady(): boolean {
  return storeReady;
}
