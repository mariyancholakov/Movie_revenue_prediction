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
