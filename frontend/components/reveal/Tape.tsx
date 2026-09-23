'use client';
// Adding-machine tape: while the request is out, the tape prints the film's
// known inputs line by line; when the answer lands it prints the opening
// weekend, rules off, and strikes the worldwide total. Then it hands over to
// the stats grid via onDone. Every figure on it is real data.
import { useLayoutEffect, useRef } from 'react';
import { gsap, useGSAP } from '@/lib/motion';
import type { Movie, Prediction } from '../types';

interface TapeProps {
  movie: Movie;
  prediction: Prediction | null;
  fmt: (n: number) => string;
  onDone: () => void;
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div data-tape-line className="overflow-hidden">
      <div data-tape-ink className={`flex items-baseline gap-2 py-[0.3rem] ${strong ? 'text-[1.05rem] sm:text-[1.15rem]' : ''}`}>
        <span className="shrink-0">{label}</span>
        <span className="flex-1 border-b border-dotted border-ink/35 -translate-y-[0.25em]" />
        <span
          className="shrink-0 tabular-nums"
          style={strong ? { color: 'color-mix(in srgb, var(--color-red) 72%, var(--color-ink))' } : undefined}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

export function Tape({ movie, prediction, fmt, onDone }: TapeProps) {
  const root = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const finished = useRef(false);

  const known: [string, string][] = [
    ['GENRE', (movie.genres?.[0] ?? '—').toUpperCase()],
    ['RUNTIME', movie.runtime ? `${Math.floor(movie.runtime / 60)}H ${movie.runtime % 60}M` : '—'],
    ['BUDGET', (movie.budget ?? 0) > 0 ? fmt(movie.budget!) : 'N/A'],
    ['RELEASED', movie.release_date ? movie.release_date.replaceAll('-', '.') : '—'],
  ];
  const ok = prediction && !prediction.error;
  const lam = prediction?.decay_curve?.decay_rate;

  // Print one line: the tape feeds a line's height, then the head strikes it
  // left to right in a few mechanical steps.
  const printLine = (t: gsap.core.Timeline, el: Element, gap = 0.12) => {
    const ink = el.querySelector('[data-tape-ink]');
    t.fromTo(el, { height: 0 }, { height: 'auto', duration: 0.14, ease: 'power1.out' }, `+=${gap}`)
      .fromTo(ink, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.32, ease: 'steps(10)' }, '<0.04');
  };

  // Phase 1, on mount: the known inputs.
  useGSAP(() => {
    if (reducedMotion()) return;
    const t = gsap.timeline();
    gsap.utils.toArray<Element>('[data-phase="1"] [data-tape-line]').forEach((el, i) => printLine(t, el, i ? 0.22 : 0.05));
    t.to('[data-tape-wait]', { opacity: 1, duration: 0.01 }, '+=0.2');
    tl.current = t;
  }, { scope: root });

  // Phase 2, once the answer is in: append to the same timeline so it waits
  // for phase 1 to finish printing, however fast the API was.
  useLayoutEffect(() => {
    if (!prediction || finished.current) return;
    finished.current = true;
    if (!ok || reducedMotion() || !tl.current) { onDone(); return; }
    const t = tl.current;
    const scope = root.current!;
    const q = gsap.utils.selector(scope);
    gsap.set(q('[data-tape-rule]'), { height: 0, scaleX: 0 });
    t.to(q('[data-tape-wait]'), { opacity: 0, height: 0, paddingBlock: 0, duration: 0.15 }, '+=0.25');
    const [ow, drop, total] = q('[data-phase="2"] [data-tape-line]');
    printLine(t, ow, 0.05);
    if (drop) printLine(t, drop, 0.22);
    t.to(q('[data-tape-rule]'), { height: 4, duration: 0.01 }, '+=0.25')
      .to(q('[data-tape-rule]'), { scaleX: 1, duration: 0.45, ease: 'power2.inOut' });
    printLine(t, total, 0.15);
    // Hold on the total, then tear the tape away to the grid.
    t.to(scope, { opacity: 0, y: -10, duration: 0.4, ease: 'power2.in' }, '+=1.1')
      .call(onDone);
    t.play();
  }, [prediction, ok, onDone]);

  return (
    <div ref={root} className="flex justify-center">
      <div className="w-full max-w-[24rem]">
        {/* the machine's print head, the tape feeds out below it */}
        <div className="h-2 bg-ink" />
        <div className="tape font-mono text-[0.78rem] sm:text-[0.82rem] tracking-[0.08em] text-ink px-5 pt-3 pb-6">
          <div data-phase="1">
            {known.map(([l, v]) => <Line key={l} label={l} value={v} />)}
          </div>
          <p data-tape-wait className="m-0 py-[0.3rem] opacity-0 text-ink3" aria-live="polite">
            <span style={{ animation: 'caretBlink 0.9s steps(1) infinite' }}>▌</span> TOTTING UP
          </p>
          {ok && (
            <div data-phase="2">
              <Line label="OPENING WKND" value={fmt(prediction!.opening_weekend)} />
              {lam != null && <Line label="WKND DROP" value={`−${Math.round((1 - Math.exp(-lam)) * 100)}%`} />}
              <div data-tape-rule className="rule-double my-2 origin-left overflow-hidden" />
              <Line label="WORLDWIDE" value={fmt(prediction!.predicted_revenue)} strong />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
