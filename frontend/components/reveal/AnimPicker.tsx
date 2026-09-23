'use client';
// TEMPORARY comparison bar. Each link reloads the page and runs the numbers
// straight away, with a simulated wait so the loading state is visible the way
// it is on an uncached film (cached predictions answer almost instantly).
import { VARIANTS, useVariant } from './variant';

const WAIT_MS = 2500;

export function AnimPicker() {
  const active = useVariant();
  return (
    <nav
      aria-label="Compare prediction animations"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-ink text-paper
                 px-2 py-1.5 font-mono text-[0.62rem] tracking-[0.1em] uppercase max-w-[calc(100vw-2rem)] overflow-x-auto"
    >
      {VARIANTS.map(v => (
        <a
          key={v.id}
          href={`?anim=${v.id}&run=1&wait=${WAIT_MS}`}
          className={`px-2.5 py-1 no-underline whitespace-nowrap ${v.id === active ? 'bg-paper text-ink' : 'text-paper/80 hover:text-paper'}`}
        >
          {v.label}
        </a>
      ))}
      <a
        href={`?anim=${active}&run=1&wait=${WAIT_MS}`}
        className="px-2.5 py-1 no-underline whitespace-nowrap text-paper/80 hover:text-paper border-l border-paper/25 ml-1"
      >
        ↻ Replay
      </a>
    </nav>
  );
}
