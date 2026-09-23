'use client';
import Link from 'next/link';
import { useRef, useSyncExternalStore } from 'react';
import { EASE, gsap, motion, useGSAP } from '@/lib/motion';

const NAMEPLATE = 'MOVIEGROSS';

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
    <header ref={root} data-intro className="px-4 sm:px-8 lg:px-14 pt-6 sm:pt-10 text-center">
      <div>
        {/* Folio: byline at left, today's edition date at right */}
        <div data-rule className="rule-hair mb-2.5" />
        <div className="flex items-baseline justify-between gap-4 font-mono text-ink3 text-[0.58rem] sm:text-[0.62rem] tracking-[0.16em] uppercase mb-4 sm:mb-6 min-h-[1em]">
          <span>Made by Mariyan Cholakov</span>
          <span className="tabular-nums text-right">{edition}</span>
        </div>

        {/* Nameplate */}
        <h1
          className="font-display text-ink font-black leading-[0.9] m-0 select-none
                     text-[3.1rem] xs:text-[3.8rem] sm:text-[6rem] lg:text-[8rem]
                     tracking-[-0.02em]"
          aria-label={NAMEPLATE}
        >
          {NAMEPLATE.split('').map((ch, i) => (
            <span key={i} data-letter aria-hidden className="inline-block">
              {ch}
            </span>
          ))}
        </h1>

        <div data-rule className="rule-double mt-4 sm:mt-6" />
      </div>

      {/* Dek */}
      <p data-follow className="font-display italic text-ink2 text-[0.95rem] sm:text-[1.2rem] leading-[1.5] max-w-[38rem] mx-auto mt-5 mb-0">
        Every film now playing, priced to its finish — the worldwide theatrical run,
        predicted by a model trained on 5,400&nbsp;past releases.
      </p>

      {/* Ledger tabs */}
      <nav data-follow className="flex items-center justify-center gap-6 sm:gap-9 mt-6">
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
