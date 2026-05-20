interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  allGenres: string[];
  activeGenres: string[];
  onToggleGenre: (genre: string) => void;
  onClearGenres: () => void;
  resultCount: number;
  totalCount: number;
}

export function SearchBar({
  query,
  onQueryChange,
  allGenres,
  activeGenres,
  onToggleGenre,
  onClearGenres,
  resultCount,
  totalCount,
}: SearchBarProps) {
  const isFiltering = query.trim() !== '' || activeGenres.length > 0;

  return (
    <div style={{ marginBottom: '1.75rem' }}>
      {/* Search input row */}
      <div style={{ position: 'relative', marginBottom: '0.85rem' }}>
        <input
          type="text"
          placeholder="Search films..."
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          className="search-input"
          style={{ paddingRight: query ? '2.5rem' : '1rem' }}
        />
        {query && (
          <button
            onClick={() => onQueryChange('')}
            className="search-clear"
            aria-label="Clear search"
            style={{
              position: 'absolute',
              right: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Genre pills */}
      {allGenres.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.4rem',
          alignItems: 'center',
        }}>
          <button
            onClick={onClearGenres}
            className={`genre-pill${activeGenres.length === 0 ? ' active' : ''}`}
          >
            ALL
          </button>
          {allGenres.map(genre => (
            <button
              key={genre}
              onClick={() => onToggleGenre(genre)}
              className={`genre-pill${activeGenres.includes(genre) ? ' active' : ''}`}
            >
              {genre.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Live result count — only shown while filtering */}
      {isFiltering && (
        <p style={{
          margin: '0.75rem 0 0',
          fontSize: '0.68rem',
          color: resultCount === 0 ? 'rgba(220, 40, 124, 0.6)' : 'rgba(220, 244, 233, 0.28)',
          letterSpacing: '0.18em',
          fontWeight: 600,
        }}>
          {resultCount === 0
            ? 'NO RESULTS'
            : `${resultCount} OF ${totalCount} FILMS`}
        </p>
      )}
    </div>
  );
}
