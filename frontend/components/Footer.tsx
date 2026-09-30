import { Seal } from './Seal';

// Site-wide footer. Carries the two lines that must appear on every page:
// the model disclaimer (product requirement) and TMDB attribution (TMDB API ToS
// requires it wherever their data is shown).
export function Footer() {
  return (
    <footer className="mt-auto pt-8 pb-12">
      <div className="px-4 sm:px-8 lg:px-14">
        <div className="rule-double mb-4" />
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <span className="flex items-center gap-3">
            <Seal size={52} />
            <span className="font-display text-lg font-black tracking-[0.01em] text-ink">
              MOVIEGROSS
            </span>
          </span>
          <div className="flex flex-col gap-1 sm:items-end">
            <p className="font-sans text-[0.75rem] leading-[1.6] text-ink2 m-0 max-w-[34rem] sm:text-right">
              Predictions from a model trained on 5,000+ theatrical runs · Not affiliated with any studio
            </p>
            <p className="font-sans text-[0.75rem] leading-[1.6] text-ink2 m-0 max-w-[34rem] sm:text-right">
              Film data and posters via the{' '}
              <a
                href="https://www.themoviedb.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="relative after:absolute after:-inset-y-3.5 after:inset-x-0 after:content-[''] text-ink2 underline decoration-ink/30 underline-offset-2 hover:text-red transition-colors"
              >
                TMDB
              </a>
              {' '}API, which does not endorse or certify this site
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
