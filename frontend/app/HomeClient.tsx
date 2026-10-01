'use client';
import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { Header } from '@/components/Header';
import { MovieGrid } from '@/components/MovieGrid';
import { Watchlist } from '@/components/Watchlist';
import type { Movie } from '@/components/types';
import { API_URL } from '@/lib/api';

// `initialMovies` is the list the server already fetched, so the posters are in
// the page itself. null means the server couldn't get it; the browser asks.
export function HomeClient({ initialMovies, children }: { initialMovies: Movie[] | null; children?: ReactNode }) {
  const [movies, setMovies] = useState<Movie[]>(initialMovies ?? []);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>(initialMovies ? 'ok' : 'loading');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGenres, setActiveGenres] = useState<string[]>([]);
  useEffect(() => {
    if (initialMovies) return;
    fetch(`${API_URL}/api/now-playing`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: Movie[]) => { setMovies(data); setStatus('ok'); })
      .catch(() => setStatus('error'));
  }, [initialMovies]);

  const posters = useMemo(() => movies.map(m => m.poster).filter(Boolean), [movies]);

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    movies.forEach(m => m.genres?.forEach(g => set.add(g)));
    return Array.from(set).sort();
  }, [movies]);

  const filteredMovies = useMemo(() => {
    let result = movies;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(m => m.title.toLowerCase().includes(q));
    }
    if (activeGenres.length > 0) {
      result = result.filter(m => m.genres?.some(g => activeGenres.includes(g)));
    }
    // Newest first. ISO dates sort as text, and a missing one sorts last.
    result = [...result].sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''));
    return result;
  }, [movies, searchQuery, activeGenres]);

  return (
    <main id="main" tabIndex={-1} className="flex-1 flex flex-col text-ink font-sans w-full min-w-0 overflow-x-clip">
      <Header />
      <MovieGrid
        posters={posters}
        filteredMovies={filteredMovies}
        totalCount={movies.length}
        status={status}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        allGenres={allGenres}
        activeGenres={activeGenres}
        onToggleGenre={g =>
          setActiveGenres(prev => (prev.includes(g) ? [] : [g]))
        }
        onClearGenres={() => setActiveGenres([])}
      />
      <Watchlist />
      {children}
    </main>
  );
}
