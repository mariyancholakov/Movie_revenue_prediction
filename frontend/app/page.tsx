'use client';
import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/Header';
import { MovieGrid } from '@/components/MovieGrid';
import type { Movie } from '@/components/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:5000';

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
    <main className="min-h-screen flex flex-col text-ink font-sans w-full min-w-0 overflow-x-hidden">
      <Header />
      <MovieGrid
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

      <footer className="mt-auto px-4 sm:px-8 lg:px-14 pt-8 pb-12">
        <div className="rule-double mb-4" />
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <span className="font-display text-lg font-black tracking-[0.01em] text-ink">
            MOVIEGROSS
          </span>
          <p className="font-mono text-[0.58rem] tracking-[0.13em] text-ink3 m-0 uppercase">
            Predictions from a model trained on 5,000+ theatrical runs · Not affiliated with any studio
          </p>
        </div>
      </footer>
    </main>
  );
}
