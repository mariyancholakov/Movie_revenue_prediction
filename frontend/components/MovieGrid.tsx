import Link from 'next/link';
import type { Movie } from './types';
import { SearchBar } from './SearchBar';

interface MovieGridProps {
  filteredMovies: Movie[];
  totalCount: number;
  loading: boolean;
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
  loading,
  query,
  onQueryChange,
  allGenres,
  activeGenres,
  onToggleGenre,
  onClearGenres,
}: MovieGridProps) {
  const isFiltering = query.trim() !== '' || activeGenres.length > 0;
  const hasNoResults = !loading && filteredMovies.length === 0;

  return (
    <section className="w-full px-16 py-12 overflow-y-auto">
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

      {!isFiltering && (
        <p className="text-cream/50 text-[0.72rem] tracking-[0.22em] mb-8 font-medium">
          {loading ? 'LOADING...' : `THE ${totalCount} NEWEST MOVIES IN THEATHERS`}
        </p>
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
              className="hover:shadow-2xl hover:shadow-green/40 hover:ease-in-out duration-200 rounded-md overflow-hidden border-2 border-transparent relative hover:scale-105"
              style={{ animationDelay: `${index * 0.04}s` }}
            >
              <img
                src={movie.poster}
                alt={movie.title}
                className="w-full block aspect-[2/3] object-cover"
              />
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
