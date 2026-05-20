import type { Movie } from './types';
import { SearchBar } from './SearchBar';

interface MovieGridProps {
  filteredMovies: Movie[];
  totalCount: number;
  selected: Movie | null;
  onSelect: (movie: Movie) => void;
  loading: boolean;
  isNarrow: boolean;
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
  selected,
  onSelect,
  loading,
  isNarrow,
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
    <section style={{
      width: isNarrow ? '420px' : '100%',
      padding: '3rem 4rem',
      transition: 'width 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
      overflowY: 'auto',
      borderRight: isNarrow ? '1px solid rgba(40, 220, 136, 0.08)' : 'none',
    }}>
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

      {/* Result count / status line */}
      {!isFiltering && (
        <p style={{ color: 'rgba(220, 244, 233, 0.28)', fontSize: '0.72rem', letterSpacing: '0.22em', marginBottom: '2rem', fontWeight: 600 }}>
          {loading ? 'LOADING...' : `NOW IN THEATERS — ${totalCount} FILMS`}
        </p>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: isNarrow ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: '1rem',
        transition: 'grid-template-columns 0.4s ease',
      }}>
        {/* Loading skeleton */}
        {loading && Array.from({ length: 12 }).map((_, i) => (
          <div key={`sk-${i}`} className="skeleton-card" />
        ))}

        {/* Movie cards */}
        {filteredMovies.map((movie, index) => (
          <div
            key={movie.tmdb_id}
            onClick={() => onSelect(movie)}
            className="movie-card"
            style={{
              borderRadius: '6px',
              overflow: 'hidden',
              border: selected?.tmdb_id === movie.tmdb_id ? '2px solid #28DC88' : '2px solid transparent',
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
              position: 'relative',
              animationDelay: `${index * 0.04}s`,
              boxShadow: selected?.tmdb_id === movie.tmdb_id
                ? '0 0 0 4px rgba(80, 38, 123, 0.35), 0 8px 28px rgba(40, 220, 136, 0.18)'
                : 'none',
            }}
          >
            <img
              src={movie.poster}
              alt={movie.title}
              style={{ width: '100%', display: 'block', aspectRatio: '2/3', objectFit: 'cover' }}
            />
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'linear-gradient(transparent, rgba(4, 12, 9, 0.96))',
              padding: '2rem 0.75rem 0.75rem',
            }}>
              <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 500, lineHeight: 1.3, color: '#DCF4E9' }}>
                {movie.title}
              </p>
            </div>
          </div>
        ))}

        {/* No results empty state */}
        {hasNoResults && (
          <div
            className="movie-card"
            style={{
              gridColumn: '1 / -1',
              padding: '3rem 2rem',
              textAlign: 'center',
              animationDelay: '0s',
            }}
          >
            <p style={{ margin: '0 0 0.5rem', fontSize: '2rem' }}>🎬</p>
            <p style={{ margin: '0 0 0.4rem', fontSize: '0.9rem', color: '#DCF4E9', fontWeight: 500 }}>
              No results found
            </p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(220, 244, 233, 0.32)' }}>
              Try a different title or clear your filters
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
