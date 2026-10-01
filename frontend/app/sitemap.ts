import type { MetadataRoute } from 'next';
import { API_URL } from '@/lib/api';
import { SITE_URL } from '@/lib/site';

// Rebuilt at most daily: the films now playing and the Ledger change weekly.
export const revalidate = 86400;

async function filmIds(path: string): Promise<number[]> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate } });
    if (!res.ok) return [];
    const films = (await res.json()) as { tmdb_id: number | string }[];
    return films.map(f => Number(f.tmdb_id)).filter(Number.isFinite);
  } catch {
    return [];
  }
}

// The four sections, plus a page for every film now playing and every film
// settled onto the Ledger. If the API can't be reached, the sections alone.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [playing, settled] = await Promise.all([filmIds('/api/now-playing'), filmIds('/api/finished')]);
  const sections: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/leaderboard`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/finished`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/how-it-works`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/api-docs`, changeFrequency: 'monthly', priority: 0.4 },
  ];
  const films = [...new Set([...playing, ...settled])].map(id => ({
    url: `${SITE_URL}/movie/${id}`,
    changeFrequency: (playing.includes(id) ? 'weekly' : 'monthly') as 'weekly' | 'monthly',
    priority: 0.5,
  }));
  return [...sections, ...films];
}
