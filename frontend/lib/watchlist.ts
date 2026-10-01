'use client';
import { useSyncExternalStore } from 'react';

// Films a visitor has saved with the SAVE button, kept in this browser only
// (no account).
export interface Saved {
  id: number;
  title: string;
  poster: string;
  date: string; // release date, 'YYYY-MM-DD'
}

const KEY = 'mg-watchlist';
const EVENT = 'mg-watchlist-change';
const EMPTY: Saved[] = [];

// useSyncExternalStore needs the same array back until the data changes.
let cachedRaw: string | null = null;
let cached: Saved[] = EMPTY;

function read(): Saved[] {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch {}
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const list = raw ? JSON.parse(raw) : [];
    cached = Array.isArray(list) ? list : EMPTY;
  } catch {
    cached = EMPTY;
  }
  return cached;
}

function write(list: Saved[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { return; }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function useWatchlist(): Saved[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function toggleSaved(film: Saved) {
  const list = read();
  write(list.some(f => f.id === film.id) ? list.filter(f => f.id !== film.id) : [...list, film]);
}
