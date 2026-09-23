'use client';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';

const TABS = [
  { href: '/', label: 'NOW PLAYING', active: true },
  { href: '/leaderboard', label: 'RANKINGS', active: false },
  { href: '/finished', label: 'THE LEDGER', active: false },
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
const getServerEditionSnapshot = () => '';

export function Header() {
  const edition = useSyncExternalStore(
    subscribeToNothing,
    getEditionSnapshot,
    getServerEditionSnapshot
  );

  return (
    <header className="px-4 sm:px-8 lg:px-14 pt-6 sm:pt-10 text-center">
      <div className="ink-settle">
        {/* Folio — masthead furniture, justified across the plate */}
        <div className="rule-hair mb-2.5" />
        <div className="flex items-center justify-between font-mono text-ink3 text-[0.58rem] sm:text-[0.62rem] tracking-[0.16em] uppercase mb-4 sm:mb-6">
          <span>Est. MMXXVI</span>
          <span className="hidden sm:inline text-ink2">The Box-Office Oracle</span>
          <span className="tabular-nums text-right min-w-[7rem]">{edition || ' '}</span>
        </div>

        {/* Nameplate */}
        <h1
          className="font-display text-ink font-black leading-[0.9] m-0 select-none
                     text-[3.1rem] xs:text-[3.8rem] sm:text-[6rem] lg:text-[8rem]
                     tracking-[-0.02em]"
        >
          MOVIEGROSS
        </h1>

        <div className="rule-double mt-4 sm:mt-6" />
      </div>

      {/* Dek */}
      <p className="font-display italic text-ink2 text-[0.95rem] sm:text-[1.2rem] leading-[1.5] max-w-[38rem] mx-auto mt-5 mb-0">
        Every film now playing, priced to its finish — the total theatrical run,
        predicted by a model read on 5,000&nbsp;past releases.
      </p>

      {/* Ledger tabs */}
      <nav className="flex items-center justify-center gap-6 sm:gap-9 mt-6">
        {TABS.map(({ href, label, active }) => (
          <Link
            key={href}
            href={href}
            data-active={active}
            className="tab font-sans text-[0.64rem] sm:text-[0.7rem] tracking-[0.18em] font-semibold text-ink2 no-underline pb-1"
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
