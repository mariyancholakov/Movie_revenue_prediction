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
    <div className="mb-7">
      {/* Search input */}
      <div className="relative mb-[0.85rem]">
        <input
          type="text"
          placeholder="Search movies..."
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          className="w-full bg-cream/4 border rounded-md border-green/30 text-cream font-sans text-[0.85rem] py-[0.65rem] transition-[border-color,box-shadow] duration-200 placeholder:text-cream/40 focus:outline-none focus:border-green/80 px-4 focus:ring-[3px] focus:ring-green/7"
          style={{ paddingRight: query ? '2.5rem' : '1rem' }}
        />
        {query && (
          <button
            onClick={() => onQueryChange('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-0 text-cream/35 text-[1.1rem] leading-none px-[0.2rem] py-0 transition-colors duration-150 hover:text-cream/75"
          >
            ×
          </button>
        )}
      </div>

      {/* Genre pills */}
      {allGenres.length > 0 && (
        <div className="flex flex-wrap gap-[0.4rem] items-center">
          <button
            onClick={onClearGenres}
            className={`rounded-full font-mono font-medium text-[0.62rem] tracking-[0.12em] px-[0.85rem] py-[0.32rem] whitespace-nowrap border transition-[border-color,color,background] duration-150 ${
              activeGenres.length === 0
                ? 'bg-green/12 border-green/70 text-green'
                : 'bg-transparent border-cream/12 text-cream/60 hover:border-green/40 hover:text-cream'
            }`}
          >
            ALL
          </button>
          {allGenres.map(genre => (
            <button
              key={genre}
              onClick={() => onToggleGenre(genre)}
              className={`rounded-full font-mono font-medium text-[0.62rem] tracking-[0.12em] px-[0.85rem] py-[0.32rem] whitespace-nowrap border transition-[border-color,color,background] duration-150 ${
                activeGenres.includes(genre)
                  ? 'bg-green/12 border-green/70 text-green'
                  : 'bg-transparent border-cream/12 text-cream/60 hover:border-green/40 hover:text-cream'
              }`}
            >
              {genre.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Live result count */}
      {isFiltering && (
        <p className={`mt-3 mb-0 text-[0.68rem] tracking-[0.18em] font-semibold ${
          resultCount === 0 ? 'text-pink/60' : 'text-cream/28'
        }`}>
          {resultCount === 0
            ? 'NO RESULTS'
            : `${resultCount} OF ${totalCount} FILMS`}
        </p>
      )}
    </div>
  );
}
