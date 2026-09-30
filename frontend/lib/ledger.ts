// The Ledger's headline statistic, shared by The Ledger and How It Works.

/** Median miss of `calls` against their actual grosses, as a percentage of
 *  the actual; null with nothing to score. Median, not mean: a handful of
 *  small releases the model overshoots by thousands of percent would
 *  otherwise swamp it. */
export function medianMiss(calls: { call: number; actual: number }[]): number | null {
  const errs = calls
    .filter(c => c.actual > 0)
    .map(c => Math.abs(c.call - c.actual) / c.actual)
    .sort((a, b) => a - b);
  if (!errs.length) return null;
  const mid = Math.floor(errs.length / 2);
  return (errs.length % 2 ? errs[mid] : (errs[mid - 1] + errs[mid]) / 2) * 100;
}

/** A settled film as /api/finished sends it. `later_calls` is the forecast
 *  after US weekends 2, 4 and 8, for the weekends its run reached. */
export interface SettledCall {
  predicted_revenue: number;
  actual_revenue: number;
  later_calls?: Record<string, number>;
}

// The weekends whose calls are scored (1 is the opening call).
const CALL_WEEKENDS = [1, 2, 4, 8];

/** The median miss of the call made after each scored weekend, over the films
 *  whose run reached it; weekends no film reached are left out. */
export function missByWeekend(entries: SettledCall[]): { week: number; films: number; median: number | null }[] {
  return CALL_WEEKENDS.map(week => {
    const calls = entries.flatMap(e => {
      const call = week === 1 ? e.predicted_revenue : e.later_calls?.[week];
      return call != null ? [{ call, actual: e.actual_revenue }] : [];
    });
    return { week, films: calls.length, median: medianMiss(calls) };
  }).filter(w => w.films > 0);
}
