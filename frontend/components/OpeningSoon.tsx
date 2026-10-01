import { Poster } from './Poster';

export interface Upcoming {
  tmdb_id: number;
  title: string;
  poster: string;
  release_date: string;
}

// "Fri, Oct 9". Read as UTC so the server's timezone can't shift the day.
function opens(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

// Films not yet in theaters. The model prices a run from its opening weekend,
// so these carry a date, not a forecast.
export function OpeningSoon({ films }: { films: Upcoming[] }) {
  if (films.length === 0) return null;
  return (
    <section aria-labelledby="opening-soon" className="w-full px-4 sm:px-8 lg:px-14 pt-6 pb-10">
      <div className="flex max-sm:flex-col max-sm:items-start sm:items-end justify-between gap-x-4 gap-y-2 mb-3">
        <h2 id="opening-soon" className="font-display text-ink text-[1.5rem] sm:text-[1.9rem] font-bold leading-none m-0">
          Opening Soon
        </h2>
        <span className="font-sans text-[0.75rem] font-medium tracking-[0.1em] sm:pb-1 sm:whitespace-nowrap text-ink2">
          FORECAST AFTER OPENING WEEKEND
        </span>
      </div>
      <div className="rule-double mb-6" />
      <ul className="list-none m-0 p-0 flex gap-4 sm:gap-5 overflow-x-auto pb-2 snap-x">
        {films.map(film => (
          <li key={film.tmdb_id} className="snap-start shrink-0 w-[8.5rem] sm:w-[10rem]">
            <div className="relative aspect-[2/3] w-full plate overflow-hidden bg-panel">
              <Poster src={film.poster} alt={film.title} fill sizes="160px" className="object-cover" loading="lazy" />
            </div>
            <p className="m-0 mt-3 pl-0.5 font-sans text-[0.8rem] font-semibold leading-[1.25] text-ink">{film.title}</p>
            <p className="m-0 mt-0.5 pl-0.5 font-mono text-[0.8rem] text-ink2">Opens {opens(film.release_date)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
