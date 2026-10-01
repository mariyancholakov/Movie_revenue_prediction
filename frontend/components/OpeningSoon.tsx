import Link from 'next/link';
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
// so these carry a date, not a forecast; a card opens the film's page, which says so.
export function OpeningSoon({ films }: { films: Upcoming[] }) {
  if (films.length === 0) return null;
  return (
    <section aria-labelledby="opening-soon" className="w-full px-4 sm:px-8 lg:px-14 pt-6 pb-10">
      <div className="mb-3">
        <h2 id="opening-soon" className="font-display text-ink text-[1.5rem] sm:text-[1.9rem] font-bold leading-none m-0">
          Opening Soon
        </h2>
      </div>
      <div className="rule-double mb-6" />
      <ul className="list-none m-0 p-0 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-8">
        {films.map(film => (
          <li key={film.tmdb_id}>
            <Link href={`/movie/${film.tmdb_id}`} className="block no-underline text-inherit group">
              <div className="relative aspect-[2/3] w-full plate overflow-hidden bg-panel">
                <Poster src={film.poster} alt={film.title} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px" className="object-cover" loading="lazy" />
              </div>
              <p className="m-0 mt-3 pl-0.5 font-sans text-[0.8rem] font-semibold leading-[1.25] text-ink group-hover:text-red transition-colors">{film.title}</p>
              <p className="m-0 mt-0.5 pl-0.5 font-mono text-[0.8rem] text-ink2">Opens {opens(film.release_date)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
