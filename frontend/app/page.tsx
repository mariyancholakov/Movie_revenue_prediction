'use client';
import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/Header';
import { MovieGrid } from '@/components/MovieGrid';
import type { Movie } from '@/components/types';
import { API_URL } from '@/lib/api';

export default function Home() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGenres, setActiveGenres] = useState<string[]>([]);
  useEffect(() => {
    fetch(`${API_URL}/api/now-playing`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: Movie[]) => { setMovies(data); setStatus('ok'); })
      .catch(() => setStatus('error'));
  }, []);

  const posters = useMemo(() => movies.map(m => m.poster).filter(Boolean), [movies]);

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    movies.forEach(m => m.genres?.forEach(g => set.add(g)));
    return Array.from(set).sort();
  }, [movies]);

  const filteredMovies = useMemo(() => {
    let result = movies;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m => m.title.toLowerCase().includes(q));
    }
    if (activeGenres.length > 0) {
      result = result.filter(m => m.genres?.some(g => activeGenres.includes(g)));
    }
    result = [...result].sort(
      (a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime()
    );
    return result;
  }, [movies, searchQuery, activeGenres]);

  return (
    <main className="flex-1 flex flex-col text-ink font-sans w-full min-w-0 overflow-x-clip">
      <Header filmCount={movies.length} />
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
    </main>
  );
}
