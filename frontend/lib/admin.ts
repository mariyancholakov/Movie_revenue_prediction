import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { API_URL } from './api';

/** The owner's key (server-only). The same value is ADMIN_API_KEY on the API
 *  host. Unset, the admin page does not exist. */
export const ADMIN_KEY = (process.env.ADMIN_API_KEY ?? '').trim();

export const SESSION_COOKIE = 'mg_admin';

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** What the session cookie holds: a MAC of the key, not the key itself. */
function sessionValue(): string {
  return createHmac('sha256', ADMIN_KEY).update('moviegross-admin-session').digest('hex');
}

export function keyMatches(given: string): boolean {
  return ADMIN_KEY !== '' && same(given.trim(), ADMIN_KEY);
}

export function newSession(): string {
  return sessionValue();
}

export async function isAdmin(): Promise<boolean> {
  if (!ADMIN_KEY) return false;
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value !== undefined && same(value, sessionValue());
}

export interface Summary {
  n: number;
  median_miss: number | null;
  bias: number | null;
  mae: number | null;
  expected: number | null;
  ratio: number | null;
}

export interface Monitor {
  generated_at: string;
  status: 'ok' | 'watch' | 'alert';
  flags: { level: 'ok' | 'watch' | 'alert'; text: string }[];
  model: {
    file: string;
    file_modified: string | null;
    age_days: number | null;
    seed_rows: number | null;
    captured_rows: number | null;
    holdout_n: number | null;
    exam: Record<string, { median_miss: number; mae: number }>;
  };
  accuracy: { opening: Summary; rolling: Summary; later: Record<string, Summary> };
  freshness: {
    tracked: number;
    newest_scrape_days: number | null;
    oldest_scrape_days: number | null;
    stale: number;
    last_settled_days: number | null;
    settled: number;
    push_subscriptions: number;
  };
  recent_settled: {
    tmdb_id: number;
    title: string;
    finished_at: string | null;
    predicted: number;
    actual: number;
    miss: number;
    bias: number;
  }[];
}

/** The report, or null if the API can't be reached or refuses the key. */
export async function fetchMonitor(): Promise<Monitor | null> {
  try {
    const res = await fetch(`${API_URL}/api/admin/monitor`, {
      headers: { 'X-Admin-Key': ADMIN_KEY },
      cache: 'no-store',
    });
    return res.ok ? ((await res.json()) as Monitor) : null;
  } catch {
    return null;
  }
}
