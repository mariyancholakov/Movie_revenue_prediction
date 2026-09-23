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

// Loading state: a running log. The typist types what the server is doing,
// one step per line, each finished line dimming as the next begins; the last
// keeps a blinking caret until the answer lands. Reduced motion (and SSR)
// shows a single static line instead.
const STEPS = ['PULLING THE FILM DETAILS', 'CHECKING THE WEEKEND GROSSES', 'RUNNING THE MODEL'];

export function TypedLoader() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    motion(() => {
      const q = gsap.utils.selector(root);
      const lines = q('[data-step]');
      gsap.set(q('[data-static]'), { display: 'none' });
      const tl = gsap.timeline();
      lines.forEach((line, i) => {
        const text = line.querySelector<HTMLElement>('[data-text]')!;
        const caret = line.querySelector('[data-caret]');
        const step = STEPS[i];
        const n = { i: 0 };
        tl.set(line, { display: 'flex' }, i ? '+=0.35' : 0)
          .to(n, {
            i: step.length,
            duration: step.length * 0.032,
            ease: `steps(${step.length})`,
            onUpdate: () => { text.textContent = step.slice(0, Math.round(n.i)); },
          });
        if (i < lines.length - 1) {
          tl.set(caret, { display: 'none' }, '+=0.35').to(line, { color: 'var(--color-ink3)', duration: 0.3 }, '<');
        }
      });
    });
  }, { scope: root });

  const caret = (
    <span
      data-caret
      aria-hidden
      className="inline-block w-[0.6em] h-[1.1em] bg-current ml-1"
      style={{ animation: 'caretBlink 0.9s steps(1) infinite' }}
    />
  );
  const line = 'flex items-center min-h-[1.5em]';

  return (
    <div ref={root} className="font-mono text-[0.78rem] sm:text-[0.85rem] tracking-[0.14em] text-ink">
      <span className="sr-only">Filing the numbers</span>
      <p data-static aria-hidden className={`${line} m-0`}>FILING THE NUMBERS{caret}</p>
      {STEPS.map(step => (
        <p key={step} data-step aria-hidden className={`${line} m-0 hidden`}>
          <span data-text className="whitespace-pre" />
          {caret}
        </p>
      ))}
    </div>
  );
}
