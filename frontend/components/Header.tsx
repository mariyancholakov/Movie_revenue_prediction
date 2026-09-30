'use client';
import Link from 'next/link';
import { useRef, useSyncExternalStore } from 'react';
import { EASE, gsap, motion, useGSAP } from '@/lib/motion';
import { Seal } from './Seal';
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

  // The nameplate is set like hand type: the rules draw out from the centre,
  // the letters drop into place one after another, then the dek and tabs.
  useGSAP(() => {
    motion(() => {
      gsap.timeline({ defaults: { ease: EASE } })
        .set(root.current, { visibility: 'visible' })
        .from('[data-rule]', { scaleX: 0, duration: 0.7, ease: 'power2.inOut', stagger: 0.15 })
        .from('[data-letter]', { yPercent: 45, opacity: 0, duration: 0.7, stagger: 0.045 }, 0.1)
        .from('[data-follow]', { y: 10, opacity: 0, duration: 0.6, stagger: 0.1 }, '-=0.35');
    });
  }, { scope: root });

  return (
    <header ref={root} data-intro className="px-4 sm:px-8 lg:px-14 pt-6 sm:pt-10 text-center max-w-[74rem] mx-auto w-full">
      <div>
        {/* Folio: byline at left, today's edition date at right */}
        <div data-rule className="rule-hair mb-2.5" />
        <div className="flex items-baseline justify-between gap-4 font-sans text-ink2 text-[0.75rem] tracking-[0.08em] sm:tracking-[0.12em] uppercase mb-4 sm:mb-6 min-h-[1em]">
          <span>Made by Mariyan Cholakov</span>
          <span className="tabular-nums text-right">
            <span className="max-sm:hidden">{edition}</span>
            <span className="sm:hidden">{shortEdition}</span>
          </span>
        </div>

        {/* Below xl there's no room for ears: the seal sits over the nameplate */}
        <div data-follow className="xl:hidden flex justify-center mb-3 sm:mb-4">
          <Seal size={64} className="w-12 h-12 sm:w-16 sm:h-16" />
        </div>

        {/* Nameplate, flanked on wide screens by the paper's seal at left */}
        <div className="xl:grid xl:grid-cols-[1fr_auto_1fr] xl:items-center xl:gap-10">
          <div data-follow className="hidden xl:flex justify-start">
            <Seal size={108} />
          </div>
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

      {/* Dek */}
      <p data-follow className="font-display italic text-ink2 text-[0.95rem] sm:text-[1.2rem] leading-[1.5] max-w-[38rem] mx-auto mt-5 mb-0">
        Every film now playing, priced to its finish — the worldwide theatrical run,
        predicted by a model trained on 5,400&nbsp;past releases.
      </p>

      {/* The record, in one line: how the calls below have fared once their
          runs closed. Space is kept while it loads so the page doesn't drop. */}
      <p data-follow className="text-ink2 text-[0.85rem] leading-[1.55] max-w-[46rem] mx-auto mt-3 mb-0 min-h-[3.9rem] sm:min-h-[1.3rem]">
        {record && (
          <>
            On {record.films} films already settled, the model&rsquo;s median miss was{' '}
            <span className="font-mono tabular-nums text-ink">{record.opening.toFixed(1)}%</span> after the opening weekend
            {record.later && (
              <>
                {' '}and <span className="font-mono tabular-nums text-ink">{record.later.miss.toFixed(1)}%</span> after weekend {record.later.week}
              </>
            )}
            .{' '}
            <Link href="/finished" className="text-ink underline decoration-ink/40 underline-offset-2 hover:decoration-ink whitespace-nowrap">
              See The Ledger
            </Link>
          </>
        )}
      </p>

      {/* Ledger tabs */}
      <nav aria-label="Sections" data-follow className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:gap-9 mt-4">
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
    </header>
  );
}
