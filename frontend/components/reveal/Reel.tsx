// Rolling-digit figure: every digit is a reel of 0–9 (three turns long) that
// rests on its value. Rendered at rest, so reduced motion and SSR show the
// plain figure; the reveal timeline spins each [data-reel] up into place.
const TURNS = 3;
const STACK = Array.from({ length: 10 * TURNS }, (_, i) => i % 10);

export function Reel({ text }: { text: string }) {
  return (
    <span className="inline-flex align-top" aria-label={text}>
      {[...text].map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} aria-hidden className="relative block overflow-hidden h-[1em]">
            <span
              data-reel
              data-digit={ch}
              className="flex flex-col"
              style={{ marginTop: `-${(TURNS - 1) * 10 + Number(ch)}em` }}
            >
              {STACK.map((d, j) => (
                <span key={j} className="block h-[1em] leading-none">{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={i} aria-hidden className="block h-[1em] leading-none">{ch}</span>
        )
      )}
    </span>
  );
}

/** How far a reel travels to its resting digit, in digit heights. */
export const REEL_TRAVEL = (TURNS - 1) * 10;

// Loading state: a blank figure whose reels spin freely until the answer lands.
export function ReelSpinner() {
  const shape = '$000.0M';
  return (
    <span className="inline-flex font-mono text-[1.6rem] sm:text-[2rem] leading-none text-ink tabular-nums" aria-hidden>
      {[...shape].map((ch, i) =>
        ch === '0' ? (
          <span key={i} className="relative block overflow-hidden h-[1em]">
            <span
              className="flex flex-col"
              style={{ animation: `reelSpin ${0.6 + (i % 3) * 0.17}s steps(10) infinite` }}
            >
              {[...STACK.slice(0, 20)].map((d, j) => (
                <span key={j} className="block h-[1em] leading-none">{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={i} className="block h-[1em] leading-none">{ch}</span>
        )
      )}
    </span>
  );
}
