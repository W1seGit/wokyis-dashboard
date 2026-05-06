/**
 * Persistent key-value store backed by a JSON file on disk (via Rust).
 * Replaces localStorage so data survives app restarts, reinstalls,
 * and changes to the webview origin.
 */

import { invoke } from '@tauri-apps/api/core';

export async function storeSet<T>(key: string, value: T): Promise<void> {
  try {
    await invoke('app_data_set', { key, value });
  } catch (err) {
    console.error('[store] SET FAILED for', key, ':', err);
    throw err;
  }
}

export async function storeGet<T>(key: string): Promise<T | null> {
  try {
    const val = await invoke<any>('app_data_get', { key });
    return (val as T) ?? null;
  } catch (err) {
    console.error('[store] GET FAILED for', key, ':', err);
    return null;
  }
}

export async function storeDelete(key: string): Promise<void> {
  try {
    await invoke('app_data_delete', { key });
  } catch (err) {
    console.error('[store] DELETE FAILED for', key, ':', err);
    throw err;
  }
}

/** Migrate data from localStorage into the file store on first run. */
export async function migrateFromLocalStorage(): Promise<void> {
  try {
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
        try {
          const parsed = JSON.parse(raw);
          await storeSet(key, parsed);
        } catch {
          await storeSet(key, raw);
        }
      }
    }
    console.log('[store] Migration complete');
  } catch (err) {
    console.error('[store] Migration FAILED:', err);
  }
}
