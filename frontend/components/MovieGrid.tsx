import Link from 'next/link';
import Image from 'next/image';
import type { Movie } from './types';
import { SearchBar } from './SearchBar';

interface MovieGridProps {
  filteredMovies: Movie[];
  totalCount: number;
  status: 'loading' | 'ok' | 'error';
  query: string;
  onQueryChange: (q: string) => void;
  allGenres: string[];
  activeGenres: string[];
  onToggleGenre: (genre: string) => void;
  onClearGenres: () => void;
}

const year = (d: string) => {
  const t = new Date(d).getFullYear();
  return Number.isNaN(t) ? '' : String(t);
};

export function MovieGrid({
  filteredMovies,
  totalCount,
  status,
  query,
  onQueryChange,
  allGenres,
  activeGenres,
  onToggleGenre,
  onClearGenres,
}: MovieGridProps) {
  const loading = status === 'loading';
  const isFiltering = query.trim() !== '' || activeGenres.length > 0;
  const hasNoResults = !loading && status !== 'error' && filteredMovies.length === 0;

  return (
    <section className="w-full px-4 sm:px-8 lg:px-14 pt-9 sm:pt-12 pb-4">
      <SearchBar
        query={query}
        onQueryChange={onQueryChange}
        allGenres={allGenres}
        activeGenres={activeGenres}
        onToggleGenre={onToggleGenre}
        onClearGenres={onClearGenres}
        resultCount={filteredMovies.length}
        totalCount={totalCount}
      />

      {/* Section head */}
      <div className="flex items-end justify-between gap-4 mt-10 mb-3">
        <h2 className="font-display text-ink text-[1.5rem] sm:text-[1.9rem] font-bold leading-none m-0">
          {isFiltering ? 'Search Results' : 'Now in Theaters'}
        </h2>
        {status !== 'error' && (
          <span className="font-mono text-ink2 text-[0.66rem] tracking-[0.1em] pb-1 whitespace-nowrap">
            {loading ? 'FILING…' : `${totalCount} FILMS · NEWEST FIRST`}
          </span>
        )}
      </div>
      <div className="rule-double mb-8" />

      {status === 'error' && (
        <div className="border border-ink/25 bg-panel/50 px-6 py-8 max-w-lg mx-auto text-center">
          <p className="font-display text-ink text-lg font-bold mb-1.5">The wire is down</p>
          <p className="text-ink2 text-[0.85rem] leading-relaxed m-0">
            No connection to the box-office desk. Start the Flask server on{' '}
            <span className="font-mono text-ink">
              {process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:5000'}
            </span>{' '}
            and reload.
          </p>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-8">
        {loading &&
          Array.from({ length: 12 }).map((_, i) => (
            <div key={`sk-${i}`}>
              <div className="paper-skeleton aspect-[2/3] border border-ink/15" />
              <div className="paper-skeleton h-3 mt-3 w-3/4" />
            </div>
          ))}

        {filteredMovies.map((movie, index) => (
          <Link
            key={movie.tmdb_id}
            href={`/movie/${movie.tmdb_id}`}
            className="block no-underline text-inherit group row-in"
            style={{ animationDelay: `${Math.min(index, 16) * 0.035}s` }}
          >
            <div className="relative aspect-[2/3] w-full plate overflow-hidden bg-panel">
              <Image
                src={movie.poster}
                alt={movie.title}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
                className="object-cover"
              />
            </div>
            {/* Printed caption */}
            <div className="mt-3 pl-0.5">
              <p className="m-0 font-sans text-[0.8rem] font-semibold leading-[1.25] text-ink group-hover:text-red transition-colors">
                {movie.title}
              </p>
              {year(movie.release_date) && (
                <p className="m-0 mt-0.5 font-mono text-[0.64rem] tracking-[0.08em] text-ink3">
                  {year(movie.release_date)}
                </p>
              )}
            </div>
          </Link>
        ))}

        {hasNoResults && (
          <div className="col-span-full py-16 text-center">
            <p className="font-display text-ink text-xl font-bold mb-1.5">Nothing on the marquee</p>
            <p className="text-ink2 text-[0.85rem] m-0">
              No entry matches that search. Try another title or clear the index.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
