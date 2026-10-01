import Link from 'next/link';
import { Seal } from './Seal';

// Site-wide footer. Carries the TMDB attribution (TMDB API ToS requires it
// wherever their data is shown), a pointer to the public API, and the maker's
// LinkedIn.
export function Footer() {
  return (
    <footer className="mt-auto pt-8 pb-12">
      <div className="px-4 sm:px-8 lg:px-14">
        <div className="rule-double mb-4" />
        <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <span className="flex items-center gap-3">
            <Seal size={52} />
            <span className="font-display text-lg font-black tracking-[0.01em] text-ink">
              MOVIEGROSS
            </span>
          </span>
          <div className="font-sans max-sm:text-[0.75rem] max-sm:leading-[1.6] sm:flex sm:flex-col sm:gap-1 sm:items-start">
            <p className="font-sans text-[0.75rem] leading-[1.6] text-ink2 m-0 max-w-[34rem] max-sm:inline">
              Film data and posters via the{' '}
              <a
                href="https://www.themoviedb.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="relative after:absolute after:-inset-y-3.5 after:inset-x-0 after:content-[''] text-ink2 underline decoration-ink/30 underline-offset-2 hover:text-red transition-colors"
              >
                TMDB
              </a>
              {' '}API, which does not endorse or certify this site<span className="sm:hidden">.</span>
            </p>
            {' '}
            {/* on a phone the two notes run together as one paragraph, and the profile floats right on the logo's line */}
            <div className="sm:flex sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-1 max-sm:contents">
              <p className="font-sans text-[0.75rem] leading-[1.6] text-ink2 m-0 max-sm:inline">
                Building something? Use the{' '}
                <Link
                  href="/api-docs"
                  className="relative after:absolute after:-inset-y-3.5 after:inset-x-0 after:content-[''] text-ink2 underline decoration-ink/30 underline-offset-2 hover:text-red transition-colors"
                >
                  free public API
                </Link>
              </p>
              {/* the maker's profile, set in the ledger's own ink; sits between the logo and the small print */}
                <a
                  href="https://www.linkedin.com/in/mariyan-cholakov-90457636b/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Mariyan Cholakov on LinkedIn"
                  className="relative max-sm:absolute max-sm:right-0 max-sm:top-[15px] inline-flex items-center gap-2 font-sans text-[0.8rem] font-semibold text-ink2 no-underline hover:text-red transition-colors after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
                    <rect x="1.5" y="1.5" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    <rect x="6" y="10" width="2.4" height="8" fill="currentColor" />
                    <circle cx="7.2" cy="6.9" r="1.4" fill="currentColor" />
                    <path d="M11.2 10h2.3v1.2c.5-.9 1.5-1.4 2.7-1.4 2.2 0 3 1.4 3 3.5V18h-2.4v-4.2c0-1.2-.4-1.8-1.4-1.8s-1.7.7-1.7 1.9V18h-2.4z" fill="currentColor" />
                  </svg>
                  <span className="max-[380px]:sr-only">Mariyan Cholakov</span>
                </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
