'use client';
import Link from 'next/link';
import { Poster } from './Poster';
import { removeSaved, useWatchlist } from '@/lib/watchlist';
import { parseDay } from '@/lib/release';

// "Opens Fri, Oct 9" for a film not yet out, else "In theaters".
function when(date: string) {
  const day = parseDay(date);
  if (!day || day.getTime() <= Date.now()) return 'In theaters';
  return `Opens ${day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

// The films this visitor saved, kept in their browser. Absent until they save one.
export function Watchlist() {
  const films = useWatchlist();
  if (films.length === 0) return null;
  return (
    <section aria-labelledby="watchlist" className="w-full px-4 sm:px-8 lg:px-14 pt-6 pb-4">
      <h2 id="watchlist" className="font-display text-ink text-[1.5rem] sm:text-[1.9rem] font-bold leading-none m-0 mb-3">
        Your Watchlist
      </h2>
      <div className="rule-double mb-6" />
      <ul className="list-none m-0 p-0 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-8">
        {films.map(film => (
          <li key={film.id}>
            <Link href={`/movie/${film.id}`} className="block no-underline text-inherit group">
              <div className="relative aspect-[2/3] w-full plate overflow-hidden bg-panel">
                <Poster src={film.poster} alt={film.title} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px" className="object-cover" loading="lazy" />
              </div>
              <p className="m-0 mt-3 pl-0.5 font-sans text-[0.8rem] font-semibold leading-[1.25] text-ink group-hover:text-red transition-colors">{film.title}</p>
              <p className="m-0 mt-0.5 pl-0.5 font-mono text-[0.8rem] text-ink2">{when(film.date)}</p>
            </Link>
            <button
              type="button"
              onClick={() => removeSaved(film.id)}
              className="mt-1 pl-0.5 py-2 font-sans text-[0.75rem] font-semibold tracking-[0.08em] text-ink2 underline decoration-ink/30 underline-offset-4 bg-transparent border-0 cursor-pointer hover:text-ink"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
