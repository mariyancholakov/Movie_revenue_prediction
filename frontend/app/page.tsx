'use client';
import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/Header';
import { MovieGrid } from '@/components/MovieGrid';
import { MovieDetail } from '@/components/MovieDetail';
import type { Movie, Prediction } from '@/components/types';

export default function Home() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selected, setSelected] = useState<Movie | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [predicting, setPredicting] = useState(false);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGenres, setActiveGenres] = useState<string[]>([]);

  useEffect(() => {
    fetch('http://127.0.0.1:5000/api/now-playing')
      .then(r => r.json())
      .then(setMovies)
      .catch(() => setMovies([]));
  }, []);

  const handleSelect = (movie: Movie) => {
    setSelected(movie);
    setPrediction(null);
  };

  const handlePredict = async () => {
    if (!selected) return;
    setPredicting(true);
    try {
      const res = await fetch('http://127.0.0.1:5000/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdb_id: selected.tmdb_id }),
      });
      const data = await res.json();
      setPrediction(data);
    } catch {
      setPrediction({ opening_weekend: 0, predicted_revenue: 0, error: 'Request failed' });
    } finally {
      setPredicting(false);
    }
  };

  // Derive unique genres from all loaded movies
  const allGenres = useMemo(() => {
    const set = new Set<string>();
    movies.forEach(m => m.genres?.forEach(g => set.add(g)));
    return Array.from(set).sort();
  }, [movies]);

  // Apply search query and genre filters simultaneously
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

  const handleToggleGenre = (genre: string) => {
    setActiveGenres(prev =>
      prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
    );
  };

  const handleBack = () => {
    setSelected(null);
    setPrediction(null);
  };

  return (
    <main style={{
      minHeight: '100vh',
      background: '#040C09',
      color: '#DCF4E9',
      fontFamily: 'var(--font-dm-sans), sans-serif',
      padding: '0',
    }}>
      <Header />

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 81px)' }}>
        <MovieGrid
          filteredMovies={filteredMovies}
          totalCount={movies.length}
          selected={selected}
          onSelect={handleSelect}
          loading={movies.length === 0}
          isNarrow={!!selected}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          allGenres={allGenres}
          activeGenres={activeGenres}
          onToggleGenre={handleToggleGenre}
          onClearGenres={() => setActiveGenres([])}
        />

        {selected && (
          <MovieDetail
            selected={selected}
            prediction={prediction}
            predicting={predicting}
            onBack={handleBack}
            onPredict={handlePredict}
          />
        )}
      </div>
    </main>
  );
}
