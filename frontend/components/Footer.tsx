import { Seal } from './Seal';

// Site-wide footer. Carries the two lines that must appear on every page:
// the model disclaimer (product requirement) and TMDB attribution (TMDB API ToS
// requires it wherever their data is shown).
export function Footer() {
  return (
    <footer className="mt-auto px-4 sm:px-8 lg:px-14 pt-8 pb-12">
      <div className="rule-double mb-4" />
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <span className="flex items-center gap-3">
          <Seal size={52} />
          <span className="font-display text-lg font-black tracking-[0.01em] text-ink">
            MOVIEGROSS
          </span>
        </span>
        <div className="flex flex-col gap-1 sm:items-end">
          <p className="font-mono text-[0.58rem] tracking-[0.13em] text-ink3 m-0 uppercase">
            Predictions from a model trained on 5,000+ theatrical runs · Not affiliated with any studio
          </p>
          <p className="font-mono text-[0.58rem] tracking-[0.13em] text-ink3 m-0 uppercase">
            Film data &amp; posters from{' '}
            <a
              href="https://www.themoviedb.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink2 underline decoration-ink/30 underline-offset-2 hover:text-red transition-colors"
            >
              TMDB
            </a>
            {' '}· This product uses the TMDB API but is not endorsed or certified by TMDB
          </p>
        </div>
      </div>
    </footer>
  );
}
