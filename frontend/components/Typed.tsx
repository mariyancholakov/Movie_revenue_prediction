'use client';
// Typewriter set for the prediction ledger. Figures render fully typed (so
// reduced motion and SSR show plain text); MovieDetail's reveal hides their
// [data-char]s and typeOut strikes them back one key at a time, at a human,
// uneven pace.
import { useRef } from 'react';
import { gsap, motion, useGSAP } from '@/lib/motion';

// Deterministic 0–1 noise per (text, index), so a figure's ink texture and
// rhythm are the same on every render and never shift under the reader.
function noise(text: string, i: number) {
  let h = 2166136261 ^ i;
  for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export function Typed({ text, className }: { text: string; className?: string }) {
  return (
    <span aria-label={text} className={`whitespace-pre ${className ?? ''}`}>
      {[...text].map((ch, i) => (
        // A real ribbon never inks two keys quite alike: each character
        // carries a hair of its own density.
        <span key={i} data-char aria-hidden className="inline-block" style={{ opacity: 0.84 + noise(text, i) * 0.16 }}>
          {ch}
        </span>
      ))}
      <span
        data-caret
        aria-hidden
        className="inline-block w-[0.55em] h-[0.95em] bg-current align-[-0.1em] ml-[0.08em] opacity-0"
      />
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

// Loading state: one line typed quickly behind a caret, then dots struck one
// at a time and cleared, on a loop until the answer lands. Answers are often back in
// a moment, so this has to read at a glance. Reduced motion (and SSR) shows
// the line with its dots, still.
const LINE = 'FILING THE NUMBERS';

export function TypedLoader() {
  const root = useRef<HTMLParagraphElement>(null);

  useGSAP(() => {
    motion(() => {
      const text = root.current!.querySelector<HTMLElement>('[data-text]')!;
      const dots = root.current!.querySelector<HTMLElement>('[data-dots]')!;
      const caret = root.current!.querySelector('[data-caret]');
      const n = { i: 0 };
      const d = { i: 0 };
      text.textContent = '';
      dots.textContent = '';
      gsap.timeline()
        .to(n, {
          i: LINE.length,
          duration: LINE.length * 0.028,
          ease: `steps(${LINE.length})`,
          onUpdate: () => { text.textContent = LINE.slice(0, Math.round(n.i)); },
        })
        // the caret steps aside once the line is typed; the dots carry on
        .set(caret, { display: 'none' }, '+=0.15')
        .add(
          gsap.timeline({ repeat: -1, repeatDelay: 0.25 }).to(d, {
            i: 3,
            duration: 0.9,
            ease: 'steps(3)',
            onUpdate: () => { dots.textContent = '.'.repeat(Math.round(d.i)); },
          })
        );
    });
  }, { scope: root });

  return (
    <p
      ref={root}
      className="font-mono text-[0.78rem] sm:text-[0.85rem] tracking-[0.14em] text-ink m-0 flex items-center min-h-[1.5em]"
    >
      <span className="sr-only">Filing the numbers</span>
      <span data-text aria-hidden className="whitespace-pre">{LINE}</span>
      <span data-dots aria-hidden className="whitespace-pre">...</span>
      <span
        data-caret
        aria-hidden
        className="inline-block w-[0.6em] h-[1.1em] bg-current"
        style={{ animation: 'caretBlink 0.9s steps(1) infinite' }}
      />
    </p>
  );
}
