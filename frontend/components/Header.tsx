'use client';
import Link from 'next/link';
import { useRef, useSyncExternalStore } from 'react';
import { EASE, gsap, motion, useGSAP } from '@/lib/motion';
import { useTrackRecord } from '@/lib/useTrackRecord';

const NAMEPLATE = 'MOVIEGROSS';

const TABS = [
  { href: '/', label: 'NOW PLAYING', active: true },
  { href: '/leaderboard', label: 'RANKINGS', active: false },
  { href: '/finished', label: 'THE LEDGER', active: false },
  { href: '/how-it-works', label: 'HOW IT WORKS', active: false },
];

// The masthead edition date is client-only on purpose: rendering it during SSR
// would bake in the server's timezone/date and mismatch on hydration. reading it
// through useSyncExternalStore (server snapshot '', client snapshot the local
// date) keeps hydration clean without a setState-in-effect.
const subscribeToNothing = () => () => {};
const getEditionSnapshot = () =>
  new Date()
    .toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    .toUpperCase();
const getShortEditionSnapshot = () =>
  new Date()
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase();
const getServerEditionSnapshot = () => '';

export function Header() {
  const record = useTrackRecord();
  const edition = useSyncExternalStore(
    subscribeToNothing,
    getEditionSnapshot,
    getServerEditionSnapshot
  );
  const shortEdition = useSyncExternalStore(
    subscribeToNothing,
    getShortEditionSnapshot,
    getServerEditionSnapshot
  );
  const root = useRef<HTMLElement>(null);

  // The nameplate is set like hand type: the letters drop into place one
  // after another, then the tabs and dek.
  useGSAP(() => {
    motion(() => {
      gsap.timeline({ defaults: { ease: EASE } })
        .set(root.current, { visibility: 'visible' })
        .from('[data-letter]', { yPercent: 45, opacity: 0, duration: 0.7, stagger: 0.045 }, 0.1)
        .from('[data-follow]', { y: 10, opacity: 0, duration: 0.6, stagger: 0.1 }, '-=0.35');
    });
  }, { scope: root });

  return (
    <header ref={root} data-intro className="px-4 sm:px-8 lg:px-14 pt-6 sm:pt-10 text-center">
      <div>
        {/* Folio: byline at left, the section tabs in the middle, today's edition date at right.
            Below xl there's no room for all three, so the tabs drop to a row of their own. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-3 xl:grid xl:grid-cols-[1fr_auto_1fr] font-sans text-ink2 text-[0.75rem] tracking-[0.08em] sm:tracking-[0.12em] uppercase mb-8 sm:mb-14 min-h-[1em]">
          <span className="xl:justify-self-start">Made by Mariyan Cholakov</span>
          <nav aria-label="Sections" data-follow className="order-last xl:order-none w-full xl:w-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:gap-9 xl:gap-8">
            {TABS.map(({ href, label, active }) => (
              <Link
                key={href}
                href={href}
                data-active={active}
                aria-current={active ? 'page' : undefined}
                className="tab whitespace-nowrap font-sans text-[0.75rem] tracking-[0.1em] sm:tracking-[0.16em] font-semibold text-ink2 no-underline pb-1"
              >
                {label}
              </Link>
            ))}
          </nav>
          <span className="tabular-nums text-right xl:justify-self-end">
            <span className="max-sm:hidden">{edition}</span>
            <span className="sm:hidden">{shortEdition}</span>
          </span>
        </div>

        {/* Nameplate */}
        <div>
          <h1
            className="font-display text-ink font-black leading-[0.9] m-0 select-none
                       text-[3.1rem] sm:text-[6rem] lg:text-[7rem] 2xl:text-[8rem]
                       tracking-[-0.02em]"
            aria-label={NAMEPLATE}
          >
            {NAMEPLATE.split('').map((ch, i) => (
              <span key={i} data-letter aria-hidden className="inline-block">
                {ch}
              </span>
            ))}
          </h1>
        </div>
      </div>

      {/* Dek, and the record in the same breath: how the calls below have fared
          once their runs closed. Space is kept while it loads so the page doesn't drop. */}
      <p data-follow className="font-display italic text-ink2 text-[0.95rem] sm:text-[1.2rem] leading-[1.5] max-w-[44rem] mx-auto mt-5 mb-0 min-h-[8.6rem] sm:min-h-[5.4rem]">
        Every film now playing, priced to its finish by a model trained on 5,400&nbsp;past releases.
        {record && (
          <>
            {' '}On {record.films} settled films, its median miss was{' '}
            <span className="tabular-nums text-ink">{record.opening.toFixed(1)}%</span> after the opening weekend
            {record.later && (
              <>
                , <span className="tabular-nums text-ink">{record.later.miss.toFixed(1)}%</span> after weekend {record.later.week}
              </>
            )}
            .
          </>
        )}
      </p>
    </header>
  );
}
