'use client';
import { useSyncExternalStore } from 'react';

// Ticks once a second. The server snapshot is null so the markup matches on
// hydration; the figures fill in on the client.
let tick = 0;
const subscribe = (cb: () => void) => {
  const id = setInterval(() => { tick = Date.now(); cb(); }, 1000);
  tick = Date.now();
  return () => clearInterval(id);
};
const getNow = () => tick;
const getServerNow = () => null;

const pad = (n: number) => String(n).padStart(2, '0');

// Big ledger-style numerals counting down to a film's opening day. The ticking
// numerals are hidden from screen readers (a clock that speaks every second is
// noise); they get the date once instead.
export function Countdown({ to }: { to: Date }) {
  const now = useSyncExternalStore(subscribe, getNow, getServerNow);
  const left = now === null ? null : Math.max(0, Math.floor((to.getTime() - now) / 1000));
  const date = to.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const parts = [
    { label: 'Days', value: left === null ? '--' : String(Math.floor(left / 86400)) },
    { label: 'Hours', value: left === null ? '--' : pad(Math.floor(left / 3600) % 24) },
    { label: 'Minutes', value: left === null ? '--' : pad(Math.floor(left / 60) % 60) },
    { label: 'Seconds', value: left === null ? '--' : pad(left % 60) },
  ];
  const opening = left === 0;
  return (
    <div role="timer" aria-live="off" className="border-t border-ink/25 pt-3">
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <p className="font-sans text-ink2 text-[0.9rem] font-semibold m-0">{opening ? 'Opening today' : 'Opens in'}</p>
        <p className="font-mono text-ink text-[0.85rem] uppercase tracking-[0.06em] m-0">{date}</p>
      </div>
      {!opening && (
        <div aria-hidden className="grid grid-cols-4 motion-reduce:grid-cols-3 divide-x divide-ink/25 border-y border-ink/25">
          {parts.map(({ label, value }) => (
            <div key={label} className={`text-center py-4 sm:py-5 ${label === 'Seconds' ? 'motion-reduce:hidden' : ''}`}>
              <p className="font-mono text-ink font-bold tabular-nums leading-none m-0 text-[2.2rem] min-[360px]:text-[2.6rem] sm:text-[5rem]">
                {value}
              </p>
              <p className="font-sans text-ink2 text-[0.7rem] sm:text-[0.75rem] font-medium tracking-[0.14em] uppercase m-0 mt-3">{label}</p>
            </div>
          ))}
        </div>
      )}
      <span className="sr-only">{opening ? 'Opens today' : `Opens ${date}`}</span>
      <p className="text-ink2 text-[0.83rem] leading-[1.55] mt-3 mb-0">
        {opening
          ? 'Opening weekend is under way. The forecast arrives the Monday after, once its first figures are in.'
          : 'The forecast appears after the opening weekend.'}
      </p>
    </div>
  );
}
