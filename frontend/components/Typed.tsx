'use client';
// Typewriter set for the prediction ledger. Figures render fully typed (so
// reduced motion and SSR show plain text); MovieDetail's reveal hides their
// [data-char]s and typeOut strikes them back one key at a time, at a human,
// uneven pace.
import { Fragment } from 'react';
import { gsap } from '@/lib/motion';

// Deterministic 0–1 noise per (text, index), so a figure's ink texture and
// rhythm are the same on every render and never shift under the reader.
function noise(text: string, i: number) {
  let h = 2166136261 ^ i;
  for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export function Typed({ text, className, breakAfter }: {
  text: string;
  className?: string;
  /** a character the figure may wrap after when its cell is too narrow
   *  (a range's dash); otherwise a figure never breaks */
  breakAfter?: string;
}) {
  // Runs of characters that never break inside; a line may only break
  // between runs, which end at each `breakAfter`.
  const runs: { ch: string; i: number }[][] = [[]];
  [...text].forEach((ch, i) => {
    runs[runs.length - 1].push({ ch, i });
    if (ch === breakAfter) runs.push([]);
  });
  return (
    <span aria-label={text} className={className}>
      {runs.map((run, r) => (
        <Fragment key={r}>
          {r > 0 && <wbr />}
          <span className="whitespace-pre">
            {run.map(({ ch, i }) => (
              // A real ribbon never inks two keys quite alike: each character
              // carries a hair of its own density.
              <span key={i} data-char aria-hidden className="inline-block" style={{ opacity: 0.84 + noise(text, i) * 0.16 }}>
                {ch}
              </span>
            ))}
            {/* The caret rides the last run, so it never wraps onto a line
                of its own; it takes no net width, so a typed figure aligns
                like plain text. */}
            {r === runs.length - 1 && (
              <span
                data-caret
                aria-hidden
                className="inline-block w-[0.55em] h-[0.95em] bg-current align-[-0.1em] ml-[0.08em] -mr-[0.63em] opacity-0"
              />
            )}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

/** Strike the characters of one Typed figure onto `tl`, a caret leading. */
export function typeOut(tl: gsap.core.Timeline, el: Element, { pace = 1, keepCaret = false } = {}) {
  const chars = gsap.utils.toArray<HTMLElement>(el.querySelectorAll('[data-char]'));
  const caret = el.querySelector('[data-caret]');
  const text = chars.map(c => c.textContent).join('');
  gsap.set(chars, { display: 'none' });
  // Keys are placed on an explicit clock so each strike's settle overlaps
  // the next key instead of queueing behind it.
  let t = tl.duration() + 0.12;
  tl.set(caret, { opacity: 1 }, t);
  chars.forEach((c, i) => {
    // Uneven keys, with a beat after the $ and the decimal point.
    t += (0.035 + noise(text, i + 7) * 0.045) * pace + (/[$.]/.test(text[i - 1] ?? '') ? 0.06 * pace : 0);
    tl.set(c, { display: 'inline-block' }, t)
      .fromTo(c, { y: -1.5, scale: 1.12 }, { y: 0, scale: 1, duration: 0.07, ease: 'power2.out' }, t);
  });
  t += 0.1;
  // The last caret blinks a few times on its own clock (an odd number of
  // flips, so it ends hidden) and the chart that follows doesn't wait for it.
  if (keepCaret) tl.call(() => { gsap.to(caret, { opacity: 0, duration: 0.01, repeat: 6, yoyo: true, repeatDelay: 0.4, delay: 0.4 }); }, [], t);
  else tl.set(caret, { opacity: 0 }, t);
}
