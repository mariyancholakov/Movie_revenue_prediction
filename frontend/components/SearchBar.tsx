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
    <div>
      {/* Search field */}
      <div className="relative max-w-md">
        <input
          type="text"
          placeholder="Look up a title…"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          className="w-[calc(100%+0.5rem)] -ml-2 pl-2 bg-transparent border-0 border-b border-ink/40 text-ink font-sans
                     text-[0.95rem] py-2 pr-8 transition-colors duration-200
                     placeholder:text-ink3 placeholder:italic search-field"
        />
        {query && (
          <button
            onClick={() => onQueryChange('')}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 -translate-y-1/2 bg-transparent border-0
                       text-ink3 text-[1.1rem] leading-none hover:text-red transition-colors"
          >
            ×
          </button>
        )}
      </div>

      {/* Genre index */}
      {allGenres.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-5">
          <button
            onClick={onClearGenres}
            data-active={activeGenres.length === 0}
            className="tab font-sans text-[0.66rem] tracking-[0.14em] font-semibold pb-0.5
                       data-[active=true]:text-ink text-ink2"
          >
            ALL
          </button>
          {allGenres.map(genre => (
            <button
              key={genre}
              onClick={() => onToggleGenre(genre)}
              data-active={activeGenres.includes(genre)}
              className="tab font-sans text-[0.66rem] tracking-[0.14em] font-medium pb-0.5
                         data-[active=true]:text-ink data-[active=true]:font-semibold text-ink2"
            >
              {genre.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Live result count */}
      {isFiltering && (
        <p
          className={`mt-4 mb-0 font-mono text-[0.7rem] tracking-[0.1em] ${
            resultCount === 0 ? 'text-red' : 'text-ink2'
          }`}
        >
          {resultCount === 0
            ? 'NO ENTRIES MATCH'
            : `${resultCount} OF ${totalCount} FILMS`}
        </p>
      )}
    </div>
  );
}
