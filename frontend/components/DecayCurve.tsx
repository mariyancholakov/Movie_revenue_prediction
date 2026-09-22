import type { DecayCurveData } from './types';

interface DecayCurveProps {
  data: DecayCurveData;
}

const INK = '#1C1814';
const RED = '#C0281F';
const RULE = '#CBC2AD';
const INK2 = '#554D40';
const INK3 = '#6E6555';
const MONO = 'var(--font-courier), monospace';

// A printed weekend-gross chart: ink line + hatched fill for the actual run,
// a dashed red line for the model's fit, ruled gridlines, Courier labels.
export function DecayCurve({ data }: DecayCurveProps) {
  const { weeks, actual_gross, fitted_weeks = [], fitted_gross = [] } = data;
  const maxGross = Math.max(...actual_gross, ...(fitted_gross.length ? fitted_gross : [0]));
  const maxWeek = Math.max(...weeks, ...(fitted_weeks.length ? fitted_weeks : [0]));

  if (maxGross === 0 || maxWeek === 0) return null;

  const width = 640;
  const height = 280;
  const pad = { top: 26, right: 20, bottom: 54, left: 66 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const xScale = (w: number) => (w / maxWeek) * innerW;
  const yScale = (g: number) => innerH - (g / maxGross) * innerH;

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

  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <pattern id="ink-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={INK} strokeWidth="1" opacity="0.14" />
        </pattern>
      </defs>

      <g transform={`translate(${pad.left},${pad.top})`}>
        {/* Horizontal gridlines */}
        {yTicks.slice(1).map(t => (
          <line
            key={`grid-${t}`}
            x1={0}
            y1={yScale(maxGross * t)}
            x2={innerW}
            y2={yScale(maxGross * t)}
            stroke={RULE}
            strokeWidth={1}
          />
        ))}

        {/* Axes */}
        <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke={INK} strokeWidth={1.5} />
        <line x1={0} y1={0} x2={0} y2={innerH} stroke={INK} strokeWidth={1.5} />

        {/* Hatched area under the actual run */}
        <path d={areaPath} fill="url(#ink-hatch)" />

        {/* Model fit — dashed red */}
        <path
          d={fittedPath}
          fill="none"
          stroke={RED}
          strokeWidth={2}
          strokeDasharray="5 4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Actual gross — solid ink */}
        <path
          d={actualLinePath}
          fill="none"
          stroke={INK}
          strokeWidth={2.25}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data points */}
        {weeks.map((w, i) => (
          <circle
            key={`dot-${i}`}
            cx={xScale(w)}
            cy={yScale(actual_gross[i])}
            r={3.5}
            fill={INK}
            stroke="#EDE7DA"
            strokeWidth={1.5}
          />
        ))}

        {/* X ticks + labels */}
        {weeks.map((w, i) => (
          <g key={`xtick-${i}`}>
            <line x1={xScale(w)} y1={innerH} x2={xScale(w)} y2={innerH + 5} stroke={INK} strokeWidth={1} />
            <text
              x={xScale(w)}
              y={innerH + 20}
              textAnchor="middle"
              fill={INK2}
              fontSize={10}
              fontFamily={MONO}
            >
              {w + 1}
            </text>
          </g>
        ))}
        <text
          x={innerW / 2}
          y={innerH + 44}
          textAnchor="middle"
          fill={INK3}
          fontSize={9}
          letterSpacing="0.18em"
          fontFamily={MONO}
        >
          WEEKEND
        </text>

        {/* Y ticks + labels */}
        {yTicks.map((t, i) => (
          <g key={`ytick-${i}`}>
            <line x1={-5} y1={yScale(maxGross * t)} x2={0} y2={yScale(maxGross * t)} stroke={INK} strokeWidth={1} />
            <text
              x={-10}
              y={yScale(maxGross * t) + 3.5}
              textAnchor="end"
              fill={INK2}
              fontSize={10}
              fontFamily={MONO}
            >
              ${(maxGross * t / 1e6).toFixed(0)}M
            </text>
          </g>
        ))}

        {/* Legend */}
        <g transform={`translate(${innerW - 150}, -16)`}>
          <line x1={0} y1={6} x2={16} y2={6} stroke={INK} strokeWidth={2.25} />
          <text x={22} y={9.5} fill={INK2} fontSize={10} fontFamily={MONO}>ACTUAL</text>
          <line x1={78} y1={6} x2={94} y2={6} stroke={RED} strokeWidth={2} strokeDasharray="5 4" />
          <text x={100} y={9.5} fill={INK2} fontSize={10} fontFamily={MONO}>MODEL</text>
        </g>
      </g>
    </svg>
  );
}
