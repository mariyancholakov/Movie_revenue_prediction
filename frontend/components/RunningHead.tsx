import Link from 'next/link';
import { Seal } from './Seal';

type Section = 'now-playing' | 'rankings' | 'finished' | 'how' | 'none';

// `short` is what a phone shows, so all four tabs stay on one line.
const TABS: { href: string; label: string; short: string; key: Section }[] = [
  { href: '/', label: 'NOW PLAYING', short: 'PLAYING', key: 'now-playing' },
  { href: '/leaderboard', label: 'RANKINGS', short: 'RANKINGS', key: 'rankings' },
  { href: '/finished', label: 'THE LEDGER', short: 'LEDGER', key: 'finished' },
  { href: '/how-it-works', label: 'HOW IT WORKS', short: 'HOW IT WORKS', key: 'how' },
];

// The running head that sits atop every interior page — a newspaper folio:
// small nameplate at left, section tabs at right, a hairline underneath.
// On the movie page, below it and off the right edge, the paper's seal is stamped faintly and
// crooked, the way a ledger page gets stamped, its ring turning slowly.
export function RunningHead({ active = 'none', stamp = true }: {
  active?: Section;
  /** off where the page carries its own ornament behind the heading */
  stamp?: boolean;
}) {
  return (
    <header className="relative pt-5 sm:pt-7">
      {stamp && <Seal
        size={320}
        spin={120}
        className="hidden sm:block absolute right-16 top-[5.5rem] w-[320px] h-[320px] rotate-[-14deg] opacity-[0.08] mix-blend-multiply pointer-events-none select-none"
      />}
      <div className="px-4 sm:px-8 lg:px-14 max-w-[74rem] mx-auto w-full">
        <div className="flex items-baseline justify-between gap-4 flex-wrap pb-3">
          <Link href="/" className="no-underline group relative after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']">
            <span className="font-display text-ink text-[1.15rem] sm:text-[1.35rem] font-black tracking-[0.02em] leading-none">
              MOVIEGROSS
            </span>
          </Link>

          <nav aria-label="Sections" className="flex w-full items-center justify-between gap-x-2 sm:w-auto sm:flex-wrap sm:justify-start sm:gap-x-7 sm:gap-y-2">
            {TABS.map(({ href, label, short, key }) => (
              <Link
                key={href}
                href={href}
                data-active={active === key}
                aria-current={active === key ? 'page' : undefined}
                className="tab whitespace-nowrap font-sans max-sm:text-[0.72rem] sm:text-[0.75rem] tracking-[0.06em] sm:tracking-[0.14em] font-semibold text-ink2 no-underline pb-1"
              >
                <span className="sm:hidden">{short}</span>
                <span className="max-sm:hidden">{label}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="rule-double" />
      </div>
    </header>
  );
}
