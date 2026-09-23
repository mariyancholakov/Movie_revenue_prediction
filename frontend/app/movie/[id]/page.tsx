'use client';
import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { MovieDetail } from '@/components/MovieDetail';
import { RunningHead } from '@/components/RunningHead';
import type { Movie, Prediction } from '@/components/types';
import { API_URL } from '@/lib/api';

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
    // The film itself comes from its own endpoint, so any TMDB id resolves —
    // including finished runs linked from the Ledger, which are no longer in
    // the now-playing list.
    fetch(`${API_URL}/api/movie/${tmdbId}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: Movie) => setMovie(data))
      .catch(() => setNotFound(true));

    // "See Also" is a nice-to-have; a failure here just hides the strip.
    fetch(`${API_URL}/api/now-playing`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((movies: Movie[]) => setAllMovies(movies))
      .catch(() => {});
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
      setPrediction({ opening_weekend: 0, predicted_revenue: 0, error: 'Request failed', code: 'network' });
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
    <main className="min-h-screen text-ink font-sans">
      <RunningHead active="none" />

      {!movie && !notFound && <MovieDetailSkeleton />}

      {movie && (
        <div className="max-w-[62rem] mx-auto w-full">
          <MovieDetail
            selected={movie}
            prediction={prediction}
            predicting={predicting}
            onBack={() => router.push('/')}
            onPredict={handlePredict}
            fullPage
          />

          {similarMovies.length > 0 && (
            <div className="px-4 sm:px-8 lg:px-14 pb-20">
              <div className="rule-hair mb-5" />
              <h2 className="font-display text-ink text-[1.15rem] font-bold m-0 mb-5">See Also</h2>
              <div className="flex flex-wrap gap-4">
                {similarMovies.map(m => (
                  <Link key={m.tmdb_id} href={`/movie/${m.tmdb_id}`} className="no-underline text-inherit group">
                    <div className="plate w-[84px] overflow-hidden bg-panel">
                      <Image
                        src={m.poster}
                        alt={m.title}
                        width={84}
                        height={126}
                        className="block object-cover"
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
        <div className="px-4 sm:px-14 py-24 text-center">
          <p className="font-display text-ink text-2xl font-bold mb-2">Not on file</p>
          <p className="text-ink2 text-[0.88rem]">
            No entry for that film.{' '}
            <Link href="/" className="text-red underline underline-offset-2 hover:no-underline">
              Back to Now Playing
            </Link>
          </p>
        </div>
      )}
    </main>
  );
}

function MovieDetailSkeleton() {
  return (
    <div className="px-4 sm:px-8 lg:px-14 py-10 max-w-[62rem] mx-auto">
      <div className="paper-skeleton h-3 w-24 mb-8" />
      <div className="flex flex-col sm:flex-row gap-7 sm:gap-10">
        <div className="paper-skeleton w-52 sm:w-60 md:w-72 aspect-[2/3] border border-ink/15 shrink-0 mx-auto sm:mx-0" />
        <div className="flex-1 flex flex-col gap-3 w-full">
          <div className="paper-skeleton h-9 w-3/4" />
          <div className="paper-skeleton h-3 w-1/3" />
          <div className="mt-3 flex flex-col gap-2.5">
            <div className="paper-skeleton h-3 w-[92%]" />
            <div className="paper-skeleton h-3 w-[85%]" />
            <div className="paper-skeleton h-3 w-[70%]" />
          </div>
        </div>
      </div>
    </div>
  );
}
