'use client';
import Link from 'next/link';

const WORD = 'MOVIEGROSS';
// Bulbs framing the marquee. Rendered top and bottom; staggered delay = chase.
const BULBS = Array.from({ length: 22 });

export function Header() {
  return (
    <header className="w-full px-5 pt-12 sm:pt-20 pb-4 sm:pb-6 text-center relative z-1">
      {/* Eyebrow */}
      <div className="flex items-center justify-center gap-3 mb-6 text-green/70">
        <span className="h-px w-8 sm:w-12 bg-green/30" />
        <span className="font-mono text-[0.6rem] sm:text-[0.68rem] tracking-[0.42em] pl-[0.42em]">
          NOW&nbsp;PLAYING
        </span>
        <span className="h-px w-8 sm:w-12 bg-green/30" />
      </div>

      {/* Marquee sign */}
      <div className="relative w-full max-w-2xl mx-auto min-w-0">
        <div
          className="relative rounded-[14px] border border-green/35 px-5 sm:px-16 py-8 sm:py-12 overflow-hidden"
          style={{
            background:
              'linear-gradient(180deg, color-mix(in srgb, var(--color-green) 6%, transparent), transparent 60%), rgba(255,255,255,0.015)',
            boxShadow:
              '0 0 0 1px rgba(0,0,0,0.4), inset 0 0 60px color-mix(in srgb, var(--color-green) 8%, transparent), 0 24px 80px -30px color-mix(in srgb, var(--color-green) 45%, transparent)',
          }}
        >
          {/* inner hairline ring */}
          <span className="pointer-events-none absolute inset-[7px] rounded-[8px] border border-green/12" />

          <h1
            className="font-display font-black text-green leading-none select-none m-0 max-w-full
                       text-[1.5rem] sm:text-[3.4rem] tracking-[0.02em] sm:tracking-[0.06em]"
            style={{ textShadow: '0 0 32px color-mix(in srgb, var(--color-green) 45%, transparent)' }}
          >
            {WORD}
          </h1>

          <p className="text-cream/70 text-[0.8rem] sm:text-[0.92rem] leading-[1.6] mt-4 mb-0 max-w-md mx-auto font-sans">
            Where every film gets its number. Predict the total box-office run of
            anything on screen — from a machine-learning model trained on 5,000+ theatrical releases.
          </p>
        </div>

        {/* Bulb rows */}
        <div className="pointer-events-none absolute left-6 right-6 -top-[3.5px] flex justify-between">
          {BULBS.map((_, i) => (
            <span key={`t${i}`} className="bulb" style={{ animationDelay: `${(i % 6) * 0.16}s` }} />
          ))}
        </div>
        <div className="pointer-events-none absolute left-6 right-6 -bottom-[3.5px] flex justify-between">
          {BULBS.map((_, i) => (
            <span key={`b${i}`} className="bulb" style={{ animationDelay: `${((i % 6) * 0.16) + 0.5}s` }} />
          ))}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex items-center justify-center gap-2 mt-8">
        {[
          { href: '/leaderboard', label: 'RANKINGS' },
          { href: '/finished', label: 'FINISHED' },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="font-mono text-[0.62rem] tracking-[0.24em] no-underline px-4 py-2 rounded-full
                       border border-green/20 text-cream/55
                       hover:border-green/55 hover:text-green transition-all duration-200"
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
