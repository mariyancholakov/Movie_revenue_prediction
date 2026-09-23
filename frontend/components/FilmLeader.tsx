'use client';
// Loading state: the countdown leader at the head of a film reel. A hand
// sweeps the dial once a second and the number counts 3, 2, 1 and round
// again until the answer lands. Each sweep's end steps the number, so the
// two never drift apart. Reduced motion shows the dial still, at 3.
import { useState } from 'react';

const R = 23; // the sweep is a stroke this far out, as wide as the dial
const C = 2 * Math.PI * R;

export function FilmLeader({ label = 'Filing the numbers' }: { label?: string }) {
  const [n, setN] = useState(3);

  return (
    <div role="status" className="flex justify-center">
      <span className="sr-only">{label}</span>
      <svg width="52" height="52" viewBox="0 0 100 100" aria-hidden>
        <circle
          cx="50" cy="50" r={R}
          fill="none" stroke="var(--color-ink)" strokeOpacity="0.14" strokeWidth={2 * R}
          strokeDasharray={C} strokeDashoffset={C}
          transform="rotate(-90 50 50)"
          className="leader-sweep"
          style={{ ['--leader-c' as string]: C }}
          onAnimationIteration={() => setN(v => (v === 1 ? 3 : v - 1))}
        />
        <line x1="0" y1="50" x2="100" y2="50" stroke="var(--color-ink)" strokeWidth="0.8" />
        <line x1="50" y1="0" x2="50" y2="100" stroke="var(--color-ink)" strokeWidth="0.8" />
        <circle cx="50" cy="50" r="47" fill="none" stroke="var(--color-ink)" strokeWidth="1.8" />
        <circle cx="50" cy="50" r="38" fill="none" stroke="var(--color-ink)" strokeWidth="0.8" />
        <text
          x="50" y="66" textAnchor="middle"
          fontFamily="var(--font-bodoni)" fontWeight="900" fontSize="46" fill="var(--color-ink)"
        >
          {n}
        </text>
      </svg>
    </div>
  );
}
