import { HomeClient } from './HomeClient';
import type { Movie } from '@/components/types';
import { API_URL } from '@/lib/api';

// The list of films is fetched here, on the server, and kept for five
// minutes, so a phone gets the page with the posters already in it instead of
// downloading the scripts, then asking the API, then starting on the images.
// INTERNAL_API_KEY (server-only) has the API rate-limit these fetches apart
// from visitors. null = the API couldn't be reached; the browser retries.
async function loadNowPlaying(): Promise<Movie[] | null> {
  const key = process.env.INTERNAL_API_KEY;
  try {
    const res = await fetch(`${API_URL}/api/now-playing`, {
      headers: key ? { 'X-Internal-Key': key } : undefined,
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const films = (await res.json()) as Movie[];
    // The synopsis is only read on a film's own page; leave it out of this one.
    return films.map(film => ({ ...film, overview: '' }));
  } catch {
    return null;
  }
}

export default async function Home() {
  return <HomeClient initialMovies={await loadNowPlaying()} />;
}
