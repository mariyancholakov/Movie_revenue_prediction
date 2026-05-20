'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { MovieDetail } from '@/components/MovieDetail';
import type { Movie, Prediction } from '@/components/types';

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
    fetch('http://127.0.0.1:5000/api/now-playing')
      .then(r => r.json())
      .then((movies: Movie[]) => {
        setAllMovies(movies);
        const found = movies.find(m => m.tmdb_id === tmdbId) ?? null;
        if (found) setMovie(found);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true));
  }, [tmdbId]);

  const handlePredict = async () => {
    if (!movie) return;
    setPredicting(true);
    try {
      const res = await fetch('http://127.0.0.1:5000/api/predict', {
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

  const otherMovies = allMovies.filter(m => m.tmdb_id !== tmdbId).slice(0, 7);

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

      {/* Movie-specific blurred poster backdrop */}
      {movie && (
        <div aria-hidden="true" style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          backgroundImage: `url(${movie.poster})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 20%',
          filter: 'blur(120px) saturate(0.5)',
          opacity: 0.09,
        }} />
      )}

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

          {/* Also in theaters */}
          {otherMovies.length > 0 && (
            <div style={{ padding: '0 4rem 4rem' }}>
              <div style={{
                height: 1,
                background: 'linear-gradient(90deg, rgba(40,220,136,0.1) 0%, rgba(40,220,136,0.03) 55%, transparent 100%)',
                marginBottom: '2rem',
              }} />
              <p style={{
                color: 'rgba(220, 244, 233, 0.28)',
                fontSize: '0.68rem',
                letterSpacing: '0.22em',
                marginBottom: '1.25rem',
                fontWeight: 600,
              }}>
                ALSO IN THEATERS
              </p>
              <div style={{
                display: 'flex',
                gap: '0.85rem',
                overflowX: 'auto',
                paddingBottom: '0.5rem',
                scrollbarWidth: 'thin',
              }}>
                {otherMovies.map(m => (
                  <Link
                    key={m.tmdb_id}
                    href={`/movie/${m.tmdb_id}`}
                    style={{ textDecoration: 'none', color: 'inherit', flexShrink: 0 }}
                  >
                    <div style={{ width: 88, transition: 'transform 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-4px)')}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                    >
                      <img
                        src={m.poster}
                        alt={m.title}
                        style={{
                          width: 88,
                          display: 'block',
                          aspectRatio: '2/3',
                          objectFit: 'cover',
                          borderRadius: '4px',
                          boxShadow: '0 4px 18px rgba(0,0,0,0.5)',
                          border: '1px solid rgba(40,220,136,0.07)',
                        }}
                      />
                      <p style={{
                        fontSize: '0.62rem',
                        marginTop: '0.45rem',
                        color: 'rgba(220, 244, 233, 0.42)',
                        lineHeight: 1.35,
                        margin: '0.45rem 0 0',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}>
                        {m.title}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {notFound && (
        <div style={{ padding: '6rem 4rem', textAlign: 'center' }}>
          <p style={{ color: 'rgba(220, 244, 233, 0.32)', fontSize: '0.85rem', letterSpacing: '0.15em' }}>
            MOVIE NOT FOUND
          </p>
        </div>
      )}
    </main>
  );
}

function MovieDetailSkeleton() {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '3rem 4rem' }}>
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
