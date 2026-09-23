'use client';
// TEMPORARY: lets the four candidate "run the numbers" animations be compared
// side by side via ?anim=. Remove along with the losers once one is chosen.
import { useSyncExternalStore } from 'react';

export const VARIANTS = [
  { id: 'current', label: 'Current' },
  { id: 'tape', label: '1 · Tape' },
  { id: 'roll', label: '2 · Rolling digits' },
  { id: 'stamp', label: '3 · Stamp' },
  { id: 'type', label: '4 · Typewriter' },
] as const;

export type Variant = (typeof VARIANTS)[number]['id'];

const subscribe = () => () => {};
const getSearch = () => window.location.search;
const getServerSearch = () => '';

export function useSearchParam(name: string): string | null {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch);
  return new URLSearchParams(search).get(name);
}

export function useVariant(): Variant {
  const v = useSearchParam('anim');
  return VARIANTS.some(x => x.id === v) ? (v as Variant) : 'current';
}
