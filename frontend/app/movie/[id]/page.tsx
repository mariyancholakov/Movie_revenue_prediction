'use client';
import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { MovieDetail } from '@/components/MovieDetail';
import type { Movie, Prediction } from '@/components/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:5000';

export default function MoviePage() {
  const params = useParams();
  const router = useRouter();
  const tmdbId = Number(params.id);

  const [movie, setMovie] = useState<Movie | null>(null);
  const [allMovies, setAllMovies] = useState<Movie[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [predicting, setPredicting] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/now-playing`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((movies: Movie[]) => {
        setAllMovies(movies);
        const found = movies.find(m => m.tmdb_id === tmdbId) ?? null;
        if (!found) { setNotFound(true); return; }
        setMovie(found);
        fetch(`${API_URL}/api/movie/${tmdbId}/cast`)
          .then(r => r.json())
          .then(data => setMovie(prev => prev
            ? {
                ...prev,
                cast: data.cast,
                director: data.director ?? undefined,
                budget: data.budget ?? 0,
                runtime: data.runtime ?? undefined,
                vote_average: data.vote_average ?? undefined,
              }
            : prev
          ))
          .catch(() => {});
      })
      .catch(() => setNotFound(true));
  }, [tmdbId]);

  const handlePredict = async () => {
    if (!movie) return;
    setPredicting(true);
    try {
      const res = await fetch(`${API_URL}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdb_id: movie.tmdb_id }),
      });
      const data = await res.json();
      setPrediction(data);
    } catch {
      setPrediction({ opening_weekend: 0, predicted_revenue: 0, error: 'Request failed' });
    } finally {
      setPredicting(false);
    }
  };

  const similarMovies = useMemo(() => {
    const others = allMovies.filter(m => m.tmdb_id !== tmdbId);
    if (!movie?.genres?.length) return others.slice(0, 7);
    const movieGenres = new Set(movie.genres);
    const scored = others
      .map(m => ({ m, score: (m.genres ?? []).filter(g => movieGenres.has(g)).length }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ m }) => m)
      .slice(0, 7);
    return scored.length >= 2 ? scored : others.slice(0, 7);
  }, [allMovies, movie, tmdbId]);

  return (
    <main style={{
      minHeight: '100vh',
      background: 'transparent',
      color: '#F2EBDA',
      fontFamily: 'var(--font-dm-sans), sans-serif',
      position: 'relative',
      zIndex: 1,
    }}>
      <nav className="px-4 sm:px-8 md:px-16 pt-6 sm:pt-8 pb-0 relative z-10">
        <Link href="/" className="no-underline">
          <span
            className="font-display text-lg font-bold text-green tracking-[0.22em]"
            style={{ textShadow: '0 0 24px color-mix(in srgb, var(--color-green) 25%, transparent)' }}
          >
            MOVIEGROSS
          </span>
        </Link>
      </nav>

     

      {!movie && !notFound && <MovieDetailSkeleton />}

      {movie && (
        <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%', position: 'relative', zIndex: 1 }}>
          <MovieDetail
            selected={movie}
            prediction={prediction}
            predicting={predicting}
            onBack={() => router.push('/')}
            onPredict={handlePredict}
            fullPage
          />

          {/* Similar films */}
          {similarMovies.length > 0 && (
            <div className="px-4 sm:px-16 pb-16">
              <div className="h-px bg-linear-to-r from-green/10 via-green/3 to-transparent mb-8" />
              <p className='text-cream/25 text-[0.62rem] mb-5 font-semibold tracking-[0.22em] uppercase'>
                Similar Films
              </p>
              <div className="flex flex-wrap justify-center gap-[0.85rem] pb-2">
                {similarMovies.map(m => (
                  <Link
                    key={m.tmdb_id}
                    href={`/movie/${m.tmdb_id}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div
                      className="transition-transform duration-200 hover:-translate-y-1"
                    >
                      <Image
                        src={m.poster}
                        alt={m.title}
                        width={88}
                        height={132}
                        className="block rounded-sm shadow-[0_4px_18px_rgba(0,0,0,0.5)] border border-green/[0.07] object-cover"
                      />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {notFound && (
        <div className="px-4 sm:px-16 py-24 text-center">
          <p className="text-cream/32 text-[0.85rem] tracking-[0.15em]">
            MOVIE NOT FOUND
          </p>
        </div>
      )}
    </main>
  );
}

function MovieDetailSkeleton() {
  return (
    <div className="px-4 sm:px-16 py-12" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div className="skeleton-card" style={{ width: 90, height: 14, marginBottom: '2rem', borderRadius: 2 }} />
      <div style={{ display: 'flex', gap: '2rem' }}>
        <div className="skeleton-card" style={{ width: 140, height: 210, flexShrink: 0, borderRadius: 6 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="skeleton-card" style={{ height: 30, width: '65%', borderRadius: 3 }} />
          <div className="skeleton-card" style={{ height: 13, width: '28%', borderRadius: 2 }} />
          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div className="skeleton-card" style={{ height: 12, width: '90%', borderRadius: 2 }} />
            <div className="skeleton-card" style={{ height: 12, width: '82%', borderRadius: 2 }} />
            <div className="skeleton-card" style={{ height: 12, width: '70%', borderRadius: 2 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
