import { API_URL } from './api';

/** One of the API's lists, fetched on the server and kept for `revalidate`
 *  seconds, so a page arrives with its data in it. INTERNAL_API_KEY
 *  (server-only) has the API rate-limit these fetches apart from visitors.
 *  null = the API couldn't be reached; the page's client code asks again. */
export async function fetchList<T>(path: string, revalidate: number): Promise<T | null> {
  const key = process.env.INTERNAL_API_KEY;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: key ? { 'X-Internal-Key': key } : undefined,
      next: { revalidate },
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
