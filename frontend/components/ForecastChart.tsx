import type { ForecastPoint } from './types';
import { axisTop, fmtAxis, fmtMoney, fmtRange } from '@/lib/money';
import { useWidth } from '@/lib/useWidth';
import { AXIS_CHAR, AXIS_FONT, chartHeight } from './chartFrame';
import { ChartTable } from './ChartTable';

interface ForecastChartProps {
  history: ForecastPoint[];
  // The settled worldwide total, once the run is over.
  final?: number | null;
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

// The forecast as it stood after each US weekend, printed as a step line: a
// call holds until the next weekend's figures remake it. The tinted band is
// where half of films like it finished; the hatched area is the US gross
// banked by then; a settled run adds its final total, dashed.
export function ForecastChart({ history, final, width: measured }: ForecastChartProps) {
  const [frame, ownWidth] = useWidth();
  const width = measured ?? ownWidth ?? 640;
  const n = history.length;
  const banded = history.every(h => h.low != null && h.high != null);
  const peak = Math.max(...history.map(h => (banded ? h.high! : h.forecast)), final ?? 0);
  if (n < 2 || peak <= 0) return null;
  const top = axisTop(peak);

  const height = chartHeight(width);
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  // Left margin just fits the widest y label, so the labels, not empty
  // space, start at the chart's left edge
  const labelChars = Math.max(...yTicks.map(t => fmtAxis(top * t, top).length));
  const pad = { top: 8, right: 0, bottom: 54, left: 12 + labelChars * AXIS_CHAR };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  // Weekend k occupies the band [k-1, k]; its call is plotted at the band's start.
  const xScale = (i: number) => (i / n) * innerW;
  const yScale = (v: number) => innerH - (v / top) * innerH;

  const stepPath = history
    .map((h, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(h.forecast)} H${xScale(i + 1)}`)
    .join(' ');

  const areaPath =
    `M0,${innerH} ` +
    history.map((h, i) => `L${xScale(i)},${yScale(h.us_to_date)} H${xScale(i + 1)}`).join(' ') +
    ` L${innerW},${innerH} Z`;

  // Along the tops of the bands, then back along their bottoms.
  const bandPath = banded
    ? history.map((h, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(h.high!)} H${xScale(i + 1)}`).join(' ') +
      [...history].reverse().map((h, j) => {
        const i = n - 1 - j;
        return ` L${xScale(i + 1)},${yScale(h.low!)} H${xScale(i)}`;
      }).join('') + ' Z'
    : '';

  // Legend entries, right-aligned above the plot and wrapping on narrow screens.
  const legend = [
    { key: 'forecast', label: 'Forecast' },
    ...(banded ? [{ key: 'range', label: 'Prediction range' }] : []),
    { key: 'us', label: 'US to date' },
    ...(final != null && final > 0 ? [{ key: 'final', label: 'Final' }] : []),
  ];
  // Each weekend's label sits under its band; thin them out when they crowd.
  const every = innerW / n < AXIS_CHAR * 4 ? 2 : 1;

  return (
    <div ref={frame}>
      <div className="flex flex-wrap justify-end gap-x-5 gap-y-1 mb-2 font-sans text-[0.75rem] text-ink2">
        {legend.map(e => (
          <span key={e.key} className="inline-flex items-center gap-1.5">
            <svg aria-hidden width="16" height="12">
              {e.key === 'forecast' && <line x1={0} y1={6} x2={16} y2={6} stroke={INK} strokeWidth={2.25} />}
              {e.key === 'range' && <rect x={0} y={0} width={16} height={12} fill={INK2} opacity={0.12} />}
              {e.key === 'us' && <rect x={0} y={0} width={16} height={12} fill="url(#fc-hatch)" stroke={RULE} strokeWidth={0.5} />}
              {e.key === 'final' && <line x1={0} y1={6} x2={16} y2={6} stroke={INK2} strokeWidth={1.5} strokeDasharray="5 4" />}
            </svg>
            {e.label}
          </span>
        ))}
      </div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible', display: 'block' }}
        aria-hidden>
        <defs>
          <pattern id="fc-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={INK} strokeWidth="1" opacity="0.14" />
          </pattern>
        </defs>

        <g transform={`translate(${pad.left},${pad.top})`}>
          {yTicks.slice(1).map(t => (
            <line key={`grid-${t}`} x1={0} y1={yScale(top * t)} x2={innerW} y2={yScale(top * t)}
              stroke={RULE} strokeWidth={1} />
          ))}

          <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke={INK} strokeWidth={1.5} />
          <line x1={0} y1={0} x2={0} y2={innerH} stroke={INK} strokeWidth={1.5} />

          {banded && <path d={bandPath} fill={INK2} opacity={0.12} />}

          <path d={areaPath} fill="url(#fc-hatch)" />

          {final != null && final > 0 && (
            <line x1={0} y1={yScale(final)} x2={innerW} y2={yScale(final)}
              stroke={INK2} strokeWidth={1.5} strokeDasharray="5 4" />
          )}

          <path d={stepPath} fill="none" stroke={INK} strokeWidth={2.25}
            strokeLinejoin="round" strokeLinecap="round" />

          {history.map((h, i) => (
            <circle key={`dot-${i}`} cx={xScale(i)} cy={yScale(h.forecast)} r={3.5}
              fill={INK} stroke={PAPER} strokeWidth={1.5} />
          ))}

          {history.map((h, i) => (
            <g key={`xtick-${i}`}>
              <line x1={xScale(i)} y1={innerH} x2={xScale(i)} y2={innerH + 5} stroke={INK} strokeWidth={1} />
              {i % every === 0 && (
                <text x={xScale(i + 0.5)} y={innerH + 22} textAnchor="middle" fill={INK2}
                  fontSize={AXIS_FONT} fontFamily={MONO}>
                  {h.week}
                </text>
              )}
            </g>
          ))}
          <text x={innerW / 2} y={innerH + 46} textAnchor="middle" fill={INK2}
            fontSize={AXIS_FONT} fontFamily={SANS}>
            After US weekend
          </text>

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
        caption={`The worldwide forecast after each US weekend, with its range and the US gross to date${final != null && final > 0 ? `. The run finished at ${fmtMoney(final)}` : ''}`}
        heads={['After US weekend', 'Worldwide forecast', 'Range', 'US gross to date']}
        rows={history.map(h => [
          h.week,
          fmtMoney(h.forecast),
          h.low != null && h.high != null ? fmtRange(h.low, h.high) : 'none',
          fmtMoney(h.us_to_date),
        ])}
      />
    </div>
  );
}
