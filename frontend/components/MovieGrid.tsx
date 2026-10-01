'use client';
import Link from 'next/link';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { EASE, gsap, motion, ScrollTrigger, useGSAP } from '@/lib/motion';
import { Poster } from './Poster';
import { GhostReel } from './GhostReel';
import type { Movie } from './types';
import { SearchBar } from './SearchBar';
import { WireDown } from './WireDown';
import { awaitingOpening } from '@/lib/release';

// The clock is read on the client only: the page may be built on the server
// at another hour, and the "figures Monday" tags must follow the reader's
// date. The server snapshot is null (no tags), so hydration matches. Minute
// resolution keeps the snapshot stable between renders.
const subscribeToNothing = () => () => {};
const getNow = (): number | null => Math.floor(Date.now() / 60000) * 60000;
const getServerNow = (): number | null => null;

// Posters at the top of the grid: two columns on a phone, up to six on a desk.
const FIRST_SCREEN = 6;

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
  const now = useSyncExternalStore(subscribeToNothing, getNow, getServerNow);

  // Posters below the first screen rise into place in small batches as they
  // scroll into view, once. The first screen is already printed in the page
  // and stays put: hiding it until a script ran would hold back the very
  // thing the reader came for. Only the first render of the list is
  // choreographed; cards that reappear after filtering just show.
  useGSAP(() => {
    if (status !== 'ok') return;
    motion(() => {
      const fold = window.innerHeight * 0.95;
      const cards = gsap.utils
        .toArray<HTMLElement>('[data-card]')
        .filter(card => card.getBoundingClientRect().top > fold);
      if (cards.length === 0) return;
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
      />

      {/* Section head */}
      <div className="flex items-end justify-between gap-4 mt-10 mb-3">
        <h2 className="font-display text-ink text-[1.5rem] sm:text-[1.9rem] font-bold leading-none m-0">
          {isFiltering ? 'Search Results' : 'Now in Theaters'}
        </h2>
        {status !== 'error' && (
          <span className="font-sans text-[0.75rem] font-medium tracking-[0.1em] pb-1 whitespace-nowrap text-ink2">
            {loading ? 'FILING…'
              : !isFiltering ? `${totalCount} FILMS`
              : filteredMovies.length === 0 ? 'NO ENTRIES MATCH'
              : `${filteredMovies.length} OF ${totalCount} FILMS`}
          </span>
        )}
      </div>
      <div className="rule-double mb-8" />

      {status === 'error' && <WireDown className="max-w-lg mx-auto" />}

      {/* This week's films run faintly behind the grid, on a ghost reel. It's
          clipped top and bottom so its tilt can't lengthen the page, but may
          run off the sides. */}
      <div className="relative isolate overflow-y-clip min-h-[20rem] sm:min-h-[40rem]">
        {/* the strip fades out toward the ends of the list, so a short result
            list doesn't show it cut off by a hard edge */}
        <div aria-hidden className="absolute inset-y-0 left-1/2 w-screen -translate-x-1/2 -z-10 pointer-events-none [mask-image:linear-gradient(to_bottom,transparent,black_140px,black_calc(100%-140px),transparent)]">
          <GhostReel posters={posters} tilt={-16} size={2.2} />
        </div>
        <div ref={grid} className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-8">
          {loading &&
            Array.from({ length: 12 }).map((_, i) => (
              <div key={`sk-${i}`}>
                <div className="paper-skeleton aspect-[2/3] border border-ink/15" />
                <div className="paper-skeleton h-3 mt-3 w-3/4" />
              </div>
            ))}

          {filteredMovies.map((movie, i) => (
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
                  // the first screen's posters load at once; the rest wait to scroll near
                  loading={i < FIRST_SCREEN ? 'eager' : 'lazy'}
                  fetchPriority={i < 2 ? 'high' : undefined}
                />
                {/* No opening-weekend figure yet, so nothing to predict until Monday */}
                {now !== null && awaitingOpening(movie.us_release_date, now) && (
                  <span className="absolute left-0 bottom-0 bg-ink text-paper font-sans font-semibold text-[0.75rem] tracking-[0.08em] px-2 py-1">
                    FIGURES MONDAY
                  </span>
                )}
              </div>
              {/* Printed caption */}
              <div className="mt-3 pl-0.5">
                <p className="m-0 font-sans text-[0.8rem] font-semibold leading-[1.25] text-ink group-hover:text-red transition-colors">
                  {movie.title}
                </p>
              </div>
            </Link>
          ))}

          {hasNoResults && (
            <div className="col-span-full py-16 text-center">
              <p className="font-display text-ink text-xl font-bold mb-1.5">Nothing on the marquee</p>
              <p className="text-ink2 text-[0.85rem] m-0">
                {isFiltering
                  ? 'No entry matches that search. Try another title or clear the index.'
                  : 'No films can be priced right now. Check back after the weekend.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
