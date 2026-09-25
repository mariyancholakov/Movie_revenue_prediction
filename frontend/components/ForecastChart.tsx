import type { ForecastPoint } from './types';
import { fmtAxis } from '@/lib/money';

interface ForecastChartProps {
  history: ForecastPoint[];
  // The settled worldwide total, once the run is over.
  final?: number | null;
}

const INK = '#1C1814';
const RULE = '#CBC2AD';
const INK2 = '#554D40';
const INK3 = '#6E6555';
const MONO = 'var(--font-courier), monospace';

// The forecast as it stood after each US weekend, printed as a step line: a
// call holds until the next weekend's figures remake it. The tinted band is
// where half of films like it finished; the hatched area is the US gross
// banked by then; a settled run adds its final total, dashed.
export function ForecastChart({ history, final }: ForecastChartProps) {
  const n = history.length;
  const banded = history.every(h => h.low != null && h.high != null);
  const peak = Math.max(...history.map(h => (banded ? h.high! : h.forecast)), final ?? 0);
  if (n < 2 || peak <= 0) return null;
  // Four gridline steps of a round size (1, 1.5, 2, 2.5, 3, 4, 5, 6 or 7.5 × a power of ten).
  const unit = 10 ** Math.floor(Math.log10(peak / 4));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10].map(m => m * unit).find(v => v * 4 >= peak)!;
  const top = step * 4;

  const width = 640;
  const height = 280;
  const pad = { top: 26, right: 20, bottom: 54, left: 66 };
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

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  // Legend entries right-aligned above the plot, each as wide as its label.
  const legend = [
    { key: 'forecast', label: 'FORECAST', width: 90 },
    ...(banded ? [{ key: 'range', label: 'PREDICTION RANGE', width: 152 }] : []),
    { key: 'us', label: 'US TO DATE', width: 104 },
    ...(final != null && final > 0 ? [{ key: 'final', label: 'FINAL', width: 62 }] : []),
  ];
  const legendWidth = legend.reduce((w, e) => w + e.width, 0);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
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

        {banded && <path data-fc-band d={bandPath} fill={INK2} opacity={0.12} />}

        <path data-fc-area d={areaPath} fill="url(#fc-hatch)" />

        {final != null && final > 0 && (
          <line data-fc-final x1={0} y1={yScale(final)} x2={innerW} y2={yScale(final)}
            stroke={INK2} strokeWidth={1.5} strokeDasharray="5 4" />
        )}

        <path data-fc-line d={stepPath} fill="none" stroke={INK} strokeWidth={2.25}
          strokeLinejoin="round" strokeLinecap="round" />

        {history.map((h, i) => (
          <circle data-fc-dot key={`dot-${i}`} cx={xScale(i)} cy={yScale(h.forecast)} r={3.5}
            fill={INK} stroke="#EDE7DA" strokeWidth={1.5} />
        ))}

        {/* Each weekend's label sits under its band */}
        {history.map((h, i) => (
          <g key={`xtick-${i}`}>
            <line x1={xScale(i)} y1={innerH} x2={xScale(i)} y2={innerH + 5} stroke={INK} strokeWidth={1} />
            <text x={xScale(i + 0.5)} y={innerH + 20} textAnchor="middle" fill={INK2} fontSize={10} fontFamily={MONO}>
              {h.week}
            </text>
          </g>
        ))}
        <text x={innerW / 2} y={innerH + 44} textAnchor="middle" fill={INK3} fontSize={9}
          letterSpacing="0.18em" fontFamily={MONO}>
          AFTER US WEEKEND
        </text>

        {yTicks.map((t, i) => (
          <g key={`ytick-${i}`}>
            <line x1={-5} y1={yScale(top * t)} x2={0} y2={yScale(top * t)} stroke={INK} strokeWidth={1} />
            <text x={-10} y={yScale(top * t) + 3.5} textAnchor="end" fill={INK2} fontSize={10} fontFamily={MONO}>
              {fmtAxis(top * t, top)}
            </text>
          </g>
        ))}

        <g transform={`translate(${innerW - legendWidth}, -16)`}>
          {legend.reduce<{ x: number; nodes: React.ReactNode[] }>((acc, e) => {
            const x = acc.x;
            acc.nodes.push(
              <g key={e.key} transform={`translate(${x}, 0)`}>
                {e.key === 'forecast' && <line x1={0} y1={6} x2={16} y2={6} stroke={INK} strokeWidth={2.25} />}
                {e.key === 'range' && <rect x={0} y={0} width={16} height={12} fill={INK2} opacity={0.12} />}
                {e.key === 'us' && <rect x={0} y={0} width={16} height={12} fill="url(#fc-hatch)" stroke={RULE} strokeWidth={0.5} />}
                {e.key === 'final' && <line x1={0} y1={6} x2={16} y2={6} stroke={INK2} strokeWidth={1.5} strokeDasharray="5 4" />}
                <text x={22} y={9.5} fill={INK2} fontSize={10} fontFamily={MONO}>{e.label}</text>
              </g>
            );
            acc.x += e.width;
            return acc;
          }, { x: 0, nodes: [] }).nodes}
        </g>
      </g>
    </svg>
  );
}
