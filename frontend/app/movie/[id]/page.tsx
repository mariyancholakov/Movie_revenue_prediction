import type { Metadata } from 'next';
import { MoviePageClient } from './MoviePageClient';
import type { Movie } from '@/components/types';
import { API_URL } from '@/lib/api';

type Props = { params: Promise<{ id: string }> };

// Server-side lookup shared by generateMetadata and the page. Next memoizes the
// identical fetch, so the API is hit once per render. 'missing' = the API said
// 404; null = it couldn't be reached, and the client retries on its own.
// INTERNAL_API_KEY (server-only) has the API rate-limit these fetches apart
// from visitors, since the host's servers share a few addresses.
async function loadMovie(id: string): Promise<Movie | 'missing' | null> {
  if (!/^\d+$/.test(id)) return 'missing';
  const key = process.env.INTERNAL_API_KEY;
  try {
    const res = await fetch(`${API_URL}/api/movie/${id}`, {
      headers: key ? { 'X-Internal-Key': key } : undefined,
      next: { revalidate: 3600 },
    });
    if (res.status === 404) return 'missing';
    if (!res.ok) return null;
    return (await res.json()) as Movie;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const movie = await loadMovie(id);
  if (movie === 'missing') return { title: 'Not on file' };
  if (!movie) return {};

  const year = movie.release_date?.slice(0, 4);
  const title = year ? `${movie.title} (${year})` : movie.title;
  const description = movie.overview
    ? movie.overview.length > 160 ? `${movie.overview.slice(0, 157).trimEnd()}…` : movie.overview
    : `The predicted worldwide box-office run of ${movie.title}.`;
  return {
    title,
    description,
    openGraph: {
      title: `${title} · MOVIEGROSS`,
      description,
      type: 'website',
    },
    // The share card is the route's opengraph-image / twitter-image.
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function MoviePage({ params }: Props) {
  const { id } = await params;
  const movie = await loadMovie(id);
  return (
    <MoviePageClient
      tmdbId={Number(id)}
      initialMovie={movie && movie !== 'missing' ? movie : null}
      initiallyMissing={movie === 'missing'}
    />
  );
}
