'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { EASE, gsap, motion, ScrollTrigger, useGSAP } from '@/lib/motion';
import { Poster } from './Poster';
import { GhostReel } from './GhostReel';
import type { Movie } from './types';
import { SearchBar } from './SearchBar';
import { WireDown } from './WireDown';
import { awaitingOpening } from '@/lib/release';

interface MovieGridProps {
  /** every film now playing, for the ghost reel behind the grid */
  posters: string[];
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
  posters,
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
  const grid = useRef<HTMLDivElement>(null);
  // One reading of the clock for the opening-weekend tags (render stays pure).
  const [now] = useState(() => Date.now());

  // Posters rise into place in small batches as they scroll into view, once.
  // Only the first render of the list is choreographed; cards that reappear
  // after filtering just show.
  useGSAP(() => {
    if (status !== 'ok') return;
    motion(() => {
      const cards = gsap.utils.toArray<HTMLElement>('[data-card]');
      gsap.set(cards, { opacity: 0, y: 24 });
      ScrollTrigger.batch(cards, {
        start: 'top 95%',
        once: true,
        onEnter: batch => gsap.to(batch, { opacity: 1, y: 0, duration: 0.6, ease: EASE, stagger: 0.06, overwrite: true }),
      });
    });
  }, { scope: grid, dependencies: [status] });

  // Filtering moves cards up the page; re-measure so waiting cards trigger.
  useEffect(() => { ScrollTrigger.refresh(); }, [filteredMovies]);

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
            {loading ? 'FILING…' : `${totalCount} FILMS`}
          </span>
        )}
      </div>
      <div className="rule-double mb-8" />

      {status === 'error' && <WireDown className="max-w-lg mx-auto" />}

      {/* This week's films run faintly behind the grid, on a ghost reel. It's
          clipped top and bottom so its tilt can't lengthen the page, but may
          run off the sides. */}
      <div className="relative isolate overflow-y-clip">
        <GhostReel posters={posters} tilt={-16} size={2.2} />
        <div ref={grid} className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-8">
          {loading &&
            Array.from({ length: 12 }).map((_, i) => (
              <div key={`sk-${i}`}>
                <div className="paper-skeleton aspect-[2/3] border border-ink/15" />
                <div className="paper-skeleton h-3 mt-3 w-3/4" />
              </div>
            ))}

          {filteredMovies.map(movie => (
            <Link
              key={movie.tmdb_id}
              href={`/movie/${movie.tmdb_id}`}
              data-card
              className="block no-underline text-inherit group"
            >
              <div className="relative aspect-[2/3] w-full plate overflow-hidden bg-panel">
                <Poster
                  src={movie.poster}
                  alt={movie.title}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
                  className="object-cover"
                />
                {/* No opening-weekend figure yet, so nothing to predict until Monday */}
                {awaitingOpening(movie.us_release_date, now) && (
                  <span className="absolute left-0 bottom-0 bg-ink text-paper font-mono text-[0.56rem] tracking-[0.14em] px-2 py-1">
                    FIGURES MONDAY
                  </span>
                )}
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
      </div>
    </section>
  );
}
