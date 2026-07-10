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
    <main className="min-h-screen flex flex-col bg-transparent text-cream font-sans relative z-[1] w-full min-w-0 overflow-x-hidden">
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
          setActiveGenres(prev =>
            prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
          )
        }
        onClearGenres={() => setActiveGenres([])}
      />

      <footer className="mt-auto px-4 sm:px-8 lg:px-16 pt-10 pb-12 border-t border-green/[0.08]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span
            className="font-display text-base font-black tracking-[0.14em] text-green/80"
            style={{ textShadow: '0 0 20px color-mix(in srgb, var(--color-green) 30%, transparent)' }}
          >
            MOVIEGROSS
          </span>
          <p className="font-mono text-[0.6rem] tracking-[0.16em] text-cream/30 m-0">
            PREDICTIONS FROM A MODEL TRAINED ON 5,000+ THEATRICAL RUNS · NOT AFFILIATED WITH ANY STUDIO
          </p>
        </div>
      </footer>
    </main>
  );
}
