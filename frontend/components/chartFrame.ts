// Shared by the two charts: they are drawn at the width they are shown, so
// their text is a true 12px on every screen instead of shrinking with the
// drawing.

export const AXIS_FONT = 12;
/** width of one Courier Prime character at AXIS_FONT */
export const AXIS_CHAR = AXIS_FONT * 0.6;

/** Plot height for a drawing `width` px wide: about the old 640×280 shape,
 *  kept tall enough on phones for readable labels and short enough on wide
 *  screens not to tower. */
export const chartHeight = (width: number) => Math.min(380, Math.max(240, Math.round(width * 0.44)));
