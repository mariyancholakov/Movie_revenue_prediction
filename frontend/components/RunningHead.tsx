import Link from 'next/link';

type Section = 'now-playing' | 'rankings' | 'finished' | 'how' | 'none';

const TABS: { href: string; label: string; key: Section }[] = [
  { href: '/', label: 'NOW PLAYING', key: 'now-playing' },
  { href: '/leaderboard', label: 'RANKINGS', key: 'rankings' },
  { href: '/finished', label: 'THE LEDGER', key: 'finished' },
  { href: '/how-it-works', label: 'HOW IT WORKS', key: 'how' },
];

// The running head that sits atop every interior page — a newspaper folio:
// small nameplate at left, section tabs at right, a hairline underneath.
export function RunningHead({ active = 'none' }: { active?: Section }) {
  return (
    <header className="px-4 sm:px-8 lg:px-14 pt-5 sm:pt-7">
      <div className="flex items-baseline justify-between gap-4 flex-wrap pb-3">
        <Link href="/" className="no-underline group">
          <span className="font-display text-ink text-[1.15rem] sm:text-[1.35rem] font-black tracking-[0.02em] leading-none">
            MOVIEGROSS
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-7">
          {TABS.map(({ href, label, key }) => (
            <Link
              key={href}
              href={href}
              data-active={active === key}
              className="tab whitespace-nowrap font-sans text-[0.6rem] sm:text-[0.66rem] tracking-[0.12em] sm:tracking-[0.16em] font-semibold text-ink2 no-underline pb-1"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="rule-double" />
    </header>
  );
}
