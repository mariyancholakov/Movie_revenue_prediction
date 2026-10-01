import { HomeClient } from './HomeClient';
import type { Movie } from '@/components/types';
import { API_URL } from '@/lib/api';
import { fetchList } from '@/lib/serverApi';
import { OpeningSoon, type Upcoming } from '@/components/OpeningSoon';

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
  const [movies, upcoming] = await Promise.all([
    loadNowPlaying(),
    fetchList<Upcoming[]>('/api/upcoming', 3600),
  ]);
  return (
    <HomeClient initialMovies={movies}>
      <OpeningSoon films={upcoming ?? []} />
    </HomeClient>
  );
}
