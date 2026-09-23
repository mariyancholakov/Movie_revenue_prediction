// Money as the site prints it: billions to two places, millions to one,
// thousands for small releases (a $4,275 opening is "$4.3K", not "$0.0M").
// Negatives take a true minus sign.
export function fmtMoney(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '−$' : '$';
  if (a >= 1e9) return sign + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return sign + (a / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return sign + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'K';
  return sign + Math.round(a);
}

/** Chart-axis labels, all in one unit chosen from the axis's top value `max`
 *  ($125M · $1.4M · $250K), so a scale never mixes M and K. */
export function fmtAxis(n: number, max: number): string {
  if (max >= 1e7) return '$' + (n / 1e6).toFixed(0) + 'M';
  if (max >= 1e6) return '$' + (n / 1e6).toFixed(n === 0 ? 0 : 1) + 'M';
  if (max >= 1e4) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(n);
}
