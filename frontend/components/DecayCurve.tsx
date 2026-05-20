import type { DecayCurveData } from './types';

interface DecayCurveProps {
  data: DecayCurveData;
}

export function DecayCurve({ data }: DecayCurveProps) {
  const { weeks, actual_gross, fitted_weeks, fitted_gross } = data;
  const maxGross = Math.max(...actual_gross, ...fitted_gross);
  const maxWeek = Math.max(...weeks, ...fitted_weeks);

  if (maxGross === 0 || maxWeek === 0) return null;

  const width = 600;
  const height = 300;
  const pad = { top: 40, right: 24, bottom: 52, left: 68 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const xScale = (w: number) => (w / maxWeek) * innerW;
  const yScale = (g: number) => innerH - (g / maxGross) * innerH;

  const fittedPath = fitted_weeks
    .map((w, i) => `${i === 0 ? 'M' : 'L'}${xScale(w)},${yScale(fitted_gross[i])}`)
    .join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="decay-bar-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#28DC88" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#28DC88" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      <g transform={`translate(${pad.left},${pad.top})`}>

        {/* Legend */}
        <g transform={`translate(${innerW - 148}, -32)`}>
          <rect x={0} y={2} width={11} height={11} fill="url(#decay-bar-grad)" rx={2} />
          <text x={17} y={12} fill="rgba(220,244,233,0.4)" fontSize={10} fontFamily="var(--font-dm-sans), sans-serif">Actual Gross</text>
          <line x1={100} y1={7} x2={118} y2={7} stroke="#DC287C" strokeWidth={2} strokeDasharray="4 2" />
          <text x={124} y={12} fill="rgba(220,244,233,0.4)" fontSize={10} fontFamily="var(--font-dm-sans), sans-serif">Fitted</text>
        </g>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map(t => (
          <line key={t}
            x1={0} y1={yScale(maxGross * t)}
            x2={innerW} y2={yScale(maxGross * t)}
            stroke="rgba(220,244,233,0.05)" strokeWidth={1}
          />
        ))}

        {/* Bars */}
        {weeks.map((w, i) => {
          const barW = Math.max(innerW / maxWeek * 0.6, 8);
          return (
            <rect key={w}
              x={xScale(w) - barW / 2}
              y={yScale(actual_gross[i])}
              width={barW}
              height={innerH - yScale(actual_gross[i])}
              fill="url(#decay-bar-grad)"
              rx={3}
            />
          );
        })}

        {/* Fitted curve — accent pink */}
        <path d={fittedPath} fill="none" stroke="#DC287C" strokeWidth={2.5} strokeDasharray="5 3" strokeLinecap="round" />

        {/* Axes */}
        <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="rgba(220,244,233,0.14)" />
        <line x1={0} y1={0} x2={0} y2={innerH} stroke="rgba(220,244,233,0.14)" />

        {/* X ticks */}
        {weeks.map(w => (
          <text key={w} x={xScale(w)} y={innerH + 20}
            textAnchor="middle" fill="rgba(220,244,233,0.32)" fontSize={10} fontFamily="var(--font-dm-sans), sans-serif">
            Wk {w + 1}
          </text>
        ))}

        {/* X axis label */}
        <text x={innerW / 2} y={innerH + 42} textAnchor="middle" fill="rgba(220,244,233,0.18)" fontSize={9} letterSpacing="0.15em" fontFamily="var(--font-dm-sans), sans-serif">
          WEEK
        </text>

        {/* Y ticks */}
        {[0, 0.5, 1].map(t => (
          <text key={t} x={-10} y={yScale(maxGross * t) + 4}
            textAnchor="end" fill="rgba(220,244,233,0.32)" fontSize={10} fontFamily="var(--font-dm-sans), sans-serif">
            ${(maxGross * t / 1e6).toFixed(0)}M
          </text>
        ))}

        {/* Y axis label */}
        <text
          x={-50}
          y={innerH / 2}
          textAnchor="middle"
          fill="rgba(220,244,233,0.18)"
          fontSize={9}
          letterSpacing="0.15em"
          fontFamily="var(--font-dm-sans), sans-serif"
          transform={`rotate(-90 -50 ${innerH / 2})`}
        >
          GROSS ($M)
        </text>

      </g>
    </svg>
  );
}
