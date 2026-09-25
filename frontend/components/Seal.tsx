'use client';
import { useId } from 'react';

// The paper's seal: a bank-style ring of text around an MG monogram, in
// rubber-stamp ink. The ink filter sits on the still parent, so as the ring
// of text turns it moves through the stamp's thin patches. The spin is
// plain CSS, so the global reduced-motion rule stills it.
const RING = 'MOVIEGROSS · THE BOX-OFFICE LEDGER · EST. MMXXVI · ';
const R = 76; // baseline radius of the ring text, in viewBox units

export function Seal({
  size,
  spin = 60,
  className,
}: {
  size: number;
  /** seconds per turn of the text ring; 0 holds it still */
  spin?: number;
  className?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden className={className}>
      <defs>
        <filter id={`ink-${id}`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="grain" />
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="1.4" result="rough" />
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="2" result="blot" />
          <feColorMatrix in="blot" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.5 0 0 0 1.62" result="thin" />
          <feComposite in="rough" in2="thin" operator="in" />
        </filter>
        <path id={`ring-${id}`} d={`M100,100 m-${R},0 a${R},${R} 0 1,1 ${2 * R},0 a${R},${R} 0 1,1 -${2 * R},0`} />
      </defs>
      <g filter={`url(#ink-${id})`} fill="var(--color-ink)" stroke="var(--color-ink)">
        <circle cx="100" cy="100" r="95" fill="none" strokeWidth="2.2" />
        <circle cx="100" cy="100" r="90.5" fill="none" strokeWidth="0.8" />
        <g
          stroke="none"
          style={spin ? { transformOrigin: '100px 100px', animation: `sealSpin ${spin}s linear infinite` } : undefined}
        >
          <text fontFamily="var(--font-franklin)" fontSize="11.5" fontWeight="600" letterSpacing="1">
            <textPath href={`#ring-${id}`} textLength={2 * Math.PI * R - 4} lengthAdjust="spacing">{RING}</textPath>
          </text>
        </g>
        <circle cx="100" cy="100" r="66" fill="none" strokeWidth="0.8" />
        <circle cx="100" cy="100" r="62" fill="none" strokeWidth="2.2" />
        <text x="100" y="118" stroke="none" textAnchor="middle" fontFamily="var(--font-bodoni)" fontWeight="900" fontSize="52">MG</text>
      </g>
    </svg>
  );
}
