// App settings, stored in expo-sqlite's key-value store and shared through useSyncExternalStore.
// Reads are synchronous, so the first render already has the saved settings.

import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import { normalizeSettings, type Settings } from '@/core/settings';

const KEY = 'settings';
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const stored = Storage.getItemSync(KEY);
    return normalizeSettings(stored ? JSON.parse(stored) : null);
  } catch {
    return normalizeSettings(null);
  }
}

let current: Settings = load();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, () => current);
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = normalizeSettings({ ...current, ...patch });
  Storage.setItemSync(KEY, JSON.stringify(current));
  for (const listener of listeners) listener();
}
