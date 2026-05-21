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
    <section className="w-full px-4 sm:px-8 lg:px-16 py-8 sm:py-12 overflow-y-auto">
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

      {!isFiltering && status !== 'error' && (
        <p className="text-cream/50 text-[0.72rem] tracking-[0.22em] mb-8 font-medium">
          {loading ? 'LOADING...' : `THE ${totalCount} NEWEST MOVIES IN THEATERS`}
        </p>
      )}

      {status === 'error' && (
        <div className="col-span-full flex flex-col items-center py-20 text-center">
          <div className="w-12 h-12 rounded-full border border-pink/30 flex items-center justify-center mb-5 text-pink/60 text-xl">
            !
          </div>
          <p className="text-cream/70 text-[0.9rem] font-medium mb-1">
            Can&apos;t connect to the API
          </p>
          <p className="text-cream/30 text-[0.78rem]">
            Make sure the Flask server is running on{' '}
            <span className="font-mono text-green/60">
              {process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:5000'}
            </span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
        {loading && Array.from({ length: 12 }).map((_, i) => (
          <div key={`sk-${i}`} className="skeleton-card" />
        ))}

        {filteredMovies.map((movie, index) => (
          <Link
            key={movie.tmdb_id}
            href={`/movie/${movie.tmdb_id}`}
            className="block no-underline text-inherit"
          >
            <div
              className="movie-card rounded-md overflow-hidden border border-green/8 relative hover:shadow-2xl hover:shadow-green/30 hover:scale-105"
              style={{ animationDelay: `${index * 0.04}s` }}
            >
              <div className="relative aspect-[2/3] w-full">
                <Image
                  src={movie.poster}
                  alt={movie.title}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
                  className="object-cover"
                />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-bg/[0.96] to-transparent px-3 pb-3 pt-8">
                <p className="m-0 text-[0.75rem] font-medium leading-[1.3] text-cream">
                  {movie.title}
                </p>
              </div>
            </div>
          </Link>
        ))}

        {hasNoResults && (
          <div
            className="movie-card rounded-[6px] col-span-full px-8 py-12 text-center"
            style={{ animationDelay: '0s' }}
          >
            <p className="m-0 mb-2 text-[2rem]">🎬</p>
            <p className="m-0 mb-[0.4rem] text-[0.9rem] text-cream font-medium">
              No results found
            </p>
            <p className="m-0 text-[0.78rem] text-cream/32">
              Try a different title or clear your filters
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
