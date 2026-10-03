export interface Rect { x: number; y: number; w: number; h: number }

/** Squarified treemap: one rectangle per value, in order (largest first), each
 *  with an area proportional to its value, filling a `W` by `H` box. */
export function squarify(values: number[], W: number, H: number): Rect[] {
  const total = values.reduce((a, b) => a + b, 0);
  const areas = values.map(v => (v / total) * W * H);
  const out: Rect[] = [];
  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, b) => a + b, 0);
    return Math.max((side * side * Math.max(...row)) / (s * s), (s * s) / (side * side * Math.min(...row)));
  };
  let x = 0, y = 0, w = W, h = H, i = 0;
  while (i < areas.length) {
    const side = Math.min(w, h);
    const row = [areas[i]];
    let j = i + 1;
    while (j < areas.length && worst([...row, areas[j]], side) <= worst(row, side)) row.push(areas[j++]);
    const s = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      const cw = s / h; let cy = y;
      row.forEach(a => { out.push({ x, y: cy, w: cw, h: a / cw }); cy += a / cw; });
      x += cw; w -= cw;
    } else {
      const rh = s / w; let cx = x;
      row.forEach(a => { out.push({ x: cx, y, w: a / rh, h: rh }); cx += a / rh; });
      y += rh; h -= rh;
    }
    i = j;
  }
  return out;
}
