'use client';
import { useEffect, useState } from 'react';
import { API_URL } from './api';
import { missByWeekend, type SettledCall } from './ledger';

/** The model's record on films whose runs have closed, for the lines that
 *  put a prediction in context. Medians as a percentage of the final gross. */
export interface TrackRecord {
  films: number;
  /** after the opening weekend */
  opening: number;
  /** after the latest later weekend any film reached, when one did */
  later: { week: number; miss: number } | null;
}

// One fetch per page load, shared by every reader of it.
let pending: Promise<TrackRecord | null> | null = null;

function load(): Promise<TrackRecord | null> {
  pending ??= fetch(`${API_URL}/api/finished`)
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then((rows: SettledCall[]): TrackRecord | null => {
      const weeks = missByWeekend(rows);
      const opening = weeks.find(w => w.week === 1);
      if (opening?.median == null) return null;
      const last = weeks.filter(w => w.week > 1 && w.median != null).at(-1);
      return {
        films: opening.films,
        opening: opening.median,
        later: last ? { week: last.week, miss: last.median! } : null,
      };
    })
    .catch(() => { pending = null; return null; });
  return pending;
}

/** null while loading, and when the record can't be had (callers show nothing). */
export function useTrackRecord(): TrackRecord | null {
  const [record, setRecord] = useState<TrackRecord | null>(null);
  useEffect(() => {
    let live = true;
    load().then(r => { if (live) setRecord(r); });
    return () => { live = false; };
  }, []);
  return record;
}
