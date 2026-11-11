// The pieces Rankings, The Ledger and How It Works set their tables from, so
// a column head, a figure and the model's tint read the same on all three.

/** one row of a table, and its column heads: the same flex, so they line up */
export const ROW = 'flex items-center gap-2.5 sm:gap-5 px-2 sm:px-3';
/** a column head: each figure is labelled where it sits */
export const HEAD = 'font-sans text-label font-medium text-ink2';
/** a figure */
export const NUM = 'font-mono tabular-nums text-small sm:text-body';
/** the model's call: a tint of the solid ink used for real grosses */
export const TINT = 'color-mix(in srgb, var(--color-ink2) 30%, transparent)';
