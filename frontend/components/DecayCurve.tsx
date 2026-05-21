import type { DecayCurveData } from './types';

interface DecayCurveProps {
  data: DecayCurveData;
}

export function DecayCurve({ data }: DecayCurveProps) {
  const { weeks, actual_gross, fitted_weeks = [], fitted_gross = [] } = data;
  const maxGross = Math.max(...actual_gross, ...(fitted_gross.length ? fitted_gross : [0]));
  const maxWeek = Math.max(...weeks, ...(fitted_weeks.length ? fitted_weeks : [0]));

  if (maxGross === 0 || maxWeek === 0) return null;

  const width = 640;
  const height = 260;
  const pad = { top: 24, right: 24, bottom: 52, left: 68 };
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
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#28DC88" stopOpacity="0.22" />
          <stop offset="85%" stopColor="#28DC88" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#28DC88" stopOpacity="0" />
        </linearGradient>
        <filter id="pink-glow" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="green-glow" x="-20%" y="-80%" width="140%" height="260%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform={`translate(${pad.left},${pad.top})`}>

        {/* Horizontal grid lines */}
        {yTicks.slice(1).map(t => (
          <line
            key={`grid-${t}`}
            x1={0} y1={yScale(maxGross * t)}
            x2={innerW} y2={yScale(maxGross * t)}
            stroke="rgba(220,244,233,0.05)"
            strokeWidth={1}
          />
        ))}

        {/* Baseline */}
        <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="rgba(220,244,233,0.12)" strokeWidth={1} />
        <line x1={0} y1={0} x2={0} y2={innerH} stroke="rgba(220,244,233,0.08)" strokeWidth={1} />

        {/* Area fill */}
        <path d={areaPath} fill="url(#area-fill)" />

        {/* Actual gross line */}
        <path
          d={actualLinePath}
          fill="none"
          stroke="#28DC88"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          filter="url(#green-glow)"
        />

        {/* Data point dots */}
        {weeks.map((w, i) => (
          <g key={`dot-${i}`}>
            <circle cx={xScale(w)} cy={yScale(actual_gross[i])} r={5} fill="#040C09" stroke="#28DC88" strokeWidth={2} />
            <circle cx={xScale(w)} cy={yScale(actual_gross[i])} r={2.5} fill="#28DC88" />
          </g>
        ))}

        {/* Fitted curve */}
        <path
          d={fittedPath}
          fill="none"
          stroke="#DC287C"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#pink-glow)"
          opacity={0.85}
        />

        {/* X tick labels */}
        {weeks.map((w, i) => (
          <text
            key={`xtick-${i}`}
            x={xScale(w)} y={innerH + 22}
            textAnchor="middle"
            fill="rgba(220,244,233,0.4)"
            fontSize={10}
            fontFamily="var(--font-dm-sans), sans-serif"
          >
            Wk {w + 1}
          </text>
        ))}

        {/* X axis label */}
        <text
          x={innerW / 2} y={innerH + 44}
          textAnchor="middle"
          fill="rgba(220,244,233,0.2)"
          fontSize={9}
          letterSpacing="0.18em"
          fontFamily="var(--font-dm-sans), sans-serif"
        >
          WEEKEND
        </text>

        {/* Y tick labels */}
        {yTicks.map((t, i) => (
          <text
            key={`ytick-${i}`}
            x={-10} y={yScale(maxGross * t) + 4}
            textAnchor="end"
            fill="rgba(220,244,233,0.35)"
            fontSize={10}
            fontFamily="var(--font-dm-sans), sans-serif"
          >
            ${(maxGross * t / 1e6).toFixed(0)}M
          </text>
        ))}

        {/* Legend */}
        <g transform={`translate(${innerW - 140}, -14)`}>
          <line x1={0} y1={6} x2={14} y2={6} stroke="#28DC88" strokeWidth={2} />
          <circle cx={7} cy={6} r={2.5} fill="#28DC88" />
          <text x={20} y={10} fill="rgba(220,244,233,0.45)" fontSize={10} fontFamily="var(--font-dm-sans), sans-serif">
            Actual
          </text>
          <line x1={66} y1={6} x2={80} y2={6} stroke="#DC287C" strokeWidth={2.5} />
          <text x={86} y={10} fill="rgba(220,244,233,0.45)" fontSize={10} fontFamily="var(--font-dm-sans), sans-serif">
            Model
          </text>
        </g>

      </g>
    </svg>
  );
}
