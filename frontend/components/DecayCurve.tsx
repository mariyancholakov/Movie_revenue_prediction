import type { DecayCurveData } from './types';
import { axisTop, fmtAxis, fmtMoney } from '@/lib/money';
import { useWidth } from '@/lib/useWidth';
import { AXIS_CHAR, AXIS_FONT, chartHeight } from './chartFrame';
import { ChartTable } from './ChartTable';

interface DecayCurveProps {
  data: DecayCurveData;
  /** the width to draw at, when the caller has measured it already */
  width?: number;
}

// The theme's tokens (globals.css), so the chart follows them.
const INK = 'var(--color-ink)';
const RULE = 'var(--color-rule)';
const INK2 = 'var(--color-ink2)';
const PAPER = 'var(--color-paper)';
const MONO = 'var(--font-courier), monospace';
const SANS = 'var(--font-franklin), sans-serif';

// A printed weekend-gross chart: ink line + hatched fill for the actual run,
// a dashed grey line for the model's fit, ruled gridlines, Courier labels.
export function DecayCurve({ data, width: measured }: DecayCurveProps) {
  const [frame, ownWidth] = useWidth();
  const width = measured ?? ownWidth ?? 640;
  const { weeks, actual_gross, fitted_weeks = [], fitted_gross = [] } = data;
  const maxGross = Math.max(...actual_gross, ...(fitted_gross.length ? fitted_gross : [0]));
  const maxWeek = Math.max(...weeks, ...(fitted_weeks.length ? fitted_weeks : [0]));

  if (maxGross === 0 || maxWeek === 0) return null;
  // Round gridlines, as on the forecast chart below it.
  const top = axisTop(maxGross);

  const height = chartHeight(width);
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  // Left margin just fits the widest y label, so the labels, not empty
  // space, start at the chart's left edge
  const labelChars = Math.max(...yTicks.map(t => fmtAxis(top * t, top).length));
  const pad = { top: 8, right: 0, bottom: 54, left: 12 + labelChars * AXIS_CHAR };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const xScale = (w: number) => (w / maxWeek) * innerW;
  const yScale = (g: number) => innerH - (g / top) * innerH;

  const actualLinePath = weeks
    .map((w, i) => `${i === 0 ? 'M' : 'L'}${xScale(w)},${yScale(actual_gross[i])}`)
    .join(' ');

  const areaPath =
    `M${xScale(weeks[0])},${innerH} ` +
    weeks.map((w, i) => `L${xScale(w)},${yScale(actual_gross[i])}`).join(' ') +
    ` L${xScale(weeks[weeks.length - 1])},${innerH} Z`;

  const fittedPath = fitted_weeks
    .map((w, i) => `${i === 0 ? 'M' : 'L'}${xScale(w)},${yScale(fitted_gross[i])}`)
    .join(' ');

  // Week labels thin out when the plot is too narrow for each to have room.
  const every = innerW / weeks.length < AXIS_CHAR * 4 ? 2 : 1;

  return (
    <div ref={frame}>
      <div className="flex flex-wrap justify-end gap-x-5 gap-y-1 mb-2 font-sans text-[0.75rem] text-ink2">
        <span className="inline-flex items-center gap-1.5">
          <svg aria-hidden width="16" height="12"><line x1="0" y1="6" x2="16" y2="6" stroke={INK} strokeWidth={2.25} /></svg>
          Actual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg aria-hidden width="16" height="12"><line x1="0" y1="6" x2="16" y2="6" stroke={INK2} strokeWidth={2.75} strokeDasharray="5 4" /></svg>
          Model
        </span>
      </div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible', display: 'block' }}
        aria-hidden>
        <defs>
          <pattern id="ink-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={INK} strokeWidth="1" opacity="0.14" />
          </pattern>
        </defs>

        <g transform={`translate(${pad.left},${pad.top})`}>
          {/* Horizontal gridlines */}
          {yTicks.slice(1).map(t => (
            <line key={`grid-${t}`} x1={0} y1={yScale(top * t)} x2={innerW} y2={yScale(top * t)}
              stroke={RULE} strokeWidth={1} />
          ))}

          {/* Axes */}
          <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke={INK} strokeWidth={1.5} />
          <line x1={0} y1={0} x2={0} y2={innerH} stroke={INK} strokeWidth={1.5} />

          {/* Hatched area under the actual run */}
          <path data-area d={areaPath} fill="url(#ink-hatch)" />

          {/* Model fit — dashed, under the actual line so the two read apart */}
          <path data-fit d={fittedPath} fill="none" stroke={INK2} strokeWidth={2.75}
            strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />

          {/* Actual gross — solid ink */}
          <path data-line d={actualLinePath} fill="none" stroke={INK} strokeWidth={2.25}
            strokeLinejoin="round" strokeLinecap="round" />

          {/* Data points */}
          {weeks.map((w, i) => (
            <circle data-dot key={`dot-${i}`} cx={xScale(w)} cy={yScale(actual_gross[i])} r={3.5}
              fill={INK} stroke={PAPER} strokeWidth={1.5} />
          ))}

          {/* X ticks + labels */}
          {weeks.map((w, i) => (
            <g key={`xtick-${i}`}>
              <line x1={xScale(w)} y1={innerH} x2={xScale(w)} y2={innerH + 5} stroke={INK} strokeWidth={1} />
              {i % every === 0 && (
                <text x={xScale(w)} y={innerH + 22} textAnchor="middle" fill={INK2}
                  fontSize={AXIS_FONT} fontFamily={MONO}>
                  {w + 1}
                </text>
              )}
            </g>
          ))}
          <text x={innerW / 2} y={innerH + 46} textAnchor="middle" fill={INK2}
            fontSize={AXIS_FONT} fontFamily={SANS}>
            Weekend
          </text>

          {/* Y ticks + labels */}
          {yTicks.map((t, i) => (
            <g key={`ytick-${i}`}>
              <line x1={-5} y1={yScale(top * t)} x2={0} y2={yScale(top * t)} stroke={INK} strokeWidth={1} />
              <text x={-10} y={yScale(top * t) + 4} textAnchor="end" fill={INK2}
                fontSize={AXIS_FONT} fontFamily={MONO}>
                {fmtAxis(top * t, top)}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <ChartTable
        caption="US weekend grosses by weekend, with the fitted decay curve"
        heads={['Weekend', 'Actual gross', 'Model fit']}
        rows={weeks.map((w, i) => {
          // The fit is sampled finely; take its point nearest this weekend.
          let k = 0;
          fitted_weeks.forEach((fw, j) => { if (Math.abs(fw - w) < Math.abs(fitted_weeks[k] - w)) k = j; });
          return [w + 1, fmtMoney(actual_gross[i]), fitted_gross.length ? fmtMoney(fitted_gross[k]) : 'none'];
        })}
      />
    </div>
  );
}
