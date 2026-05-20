'use client';
import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/Header';
import { MovieGrid } from '@/components/MovieGrid';
import type { Movie } from '@/components/types';

export default function Home() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGenres, setActiveGenres] = useState<string[]>([]);

  useEffect(() => {
    fetch('http://127.0.0.1:5000/api/now-playing')
      .then(r => r.json())
      .then(setMovies)
      .catch(() => setMovies([]));
  }, []);

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
    return result;
  }, [movies, searchQuery, activeGenres]);

  return (
    <main style={{
      minHeight: '100vh',
      background: 'transparent',
      color: '#DCF4E9',
      fontFamily: 'var(--font-dm-sans), sans-serif',
      position: 'relative',
      zIndex: 1,
    }}>
      <Header />
      <MovieGrid
        filteredMovies={filteredMovies}
        totalCount={movies.length}
        loading={movies.length === 0}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        allGenres={allGenres}
        activeGenres={activeGenres}
        onToggleGenre={g =>
          setActiveGenres(prev =>
            prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
          )
        }
        onClearGenres={() => setActiveGenres([])}
      />
    </main>
  );
}
