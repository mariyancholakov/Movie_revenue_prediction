// Money as the site prints it: billions to two places, millions to one,
// thousands for small releases (a $4,275 opening is "$4.3K", not "$0.0M").
// Negatives take a true minus sign. Each unit takes over where the one below
// would round up to 1000, so $999.96M prints as $1.00B, not $1000.0M.
export function fmtMoney(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '−$' : '$';
  if (a >= 999.95e6) return sign + (a / 1e9).toFixed(2) + 'B';
  if (a >= 999.5e3) return sign + (a / 1e6).toFixed(1) + 'M';
  if (a >= 999.5) return sign + (a / 1e3).toFixed(a >= 9.95e3 ? 0 : 1) + 'K';
  return sign + Math.round(a);
}

/** A range as the site prints it, compact enough for one figure cell: each
 *  end to three figures, the $ once, and the unit once when both ends share
 *  it: $567–814M, $1.45–1.76B, $820K–1.2M. */
export function fmtRange(low: number, high: number): string {
  // Units switch where three figures would round up to 1000.
  const unit = (n: number): [number, string] =>
    n >= 999.5e6 ? [1e9, 'B'] : n >= 999.5e3 ? [1e6, 'M'] : n >= 999.5 ? [1e3, 'K'] : [1, ''];
  const fig = (n: number, [div]: [number, string]) => String(Number((n / div).toPrecision(3)));
  const lo = unit(low), hi = unit(high);
  return lo[1] === hi[1]
    ? `$${fig(low, lo)}\u2013${fig(high, hi)}${hi[1]}`
    : `$${fig(low, lo)}${lo[1]}\u2013${fig(high, hi)}${hi[1]}`;
}

/** Chart-axis labels, all in one unit chosen from the axis's top value `max`
 *  ($125M · $1.4M · $250K), so a scale never mixes M and K. */
export function fmtAxis(n: number, max: number): string {
  if (max >= 1e7) return '$' + (n / 1e6).toFixed(0) + 'M';
  if (max >= 1e6) return '$' + (n / 1e6).toFixed(n === 0 ? 0 : 1) + 'M';
  if (max >= 1e4) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(n);
}
