import type { Metadata } from 'next';
import { Poster } from '@/components/Poster';
import type { Movie } from '@/components/types';
import { fmtMoney } from '@/lib/money';
import { fetchList } from '@/lib/serverApi';
import { SITE_URL } from '@/lib/site';

// A film's forecast as a small box other sites frame (docs: /api-docs). Just
// the box: the site footer is hidden here. It reads the same kept lists as the
// rest of the site, so a busy page that embeds it costs the API nothing.
export const metadata: Metadata = {
  title: 'Forecast',
  robots: { index: false },
};

type Ranked = { tmdb_id: number; predicted_revenue: number; opening_weekend: number };
type Settled = { tmdb_id: number; predicted_revenue: number; actual_revenue: number };

export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tmdbId = Number(id);
  const [movie, ranked, settled] = await Promise.all([
    /^\d+$/.test(id) ? fetchList<Movie>(`/api/movie/${tmdbId}`, 3600) : null,
    fetchList<Ranked[]>('/api/leaderboard', 300),
    fetchList<Settled[]>('/api/finished', 300),
  ]);
  const live = ranked?.find(r => r.tmdb_id === tmdbId);
  const done = settled?.find(r => r.tmdb_id === tmdbId);
  const rows: [string, string][] = done
    ? [['Predicted', fmtMoney(done.predicted_revenue)], ['Settled at', fmtMoney(done.actual_revenue)]]
    : live
    ? [['Predicted worldwide total', fmtMoney(live.predicted_revenue)], ['Opening weekend', fmtMoney(live.opening_weekend)]]
    : [];

  return (
    <main id="main" className="min-h-screen bg-paper text-ink font-sans p-3">
      {/* inside a frame there is only the box */}
      <style>{`body > footer { display: none; }`}</style>
      <a
        href={`${SITE_URL}/movie/${tmdbId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex gap-3.5 no-underline text-inherit border border-ink p-3 h-[calc(100vh-1.5rem)] min-h-[9.5rem]"
      >
        <div className="relative w-[84px] shrink-0 aspect-[2/3] self-start plate bg-panel overflow-hidden">
          <Poster src={movie?.poster ?? ''} alt={movie?.title ?? ''} fill sizes="84px" className="object-cover" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-display font-black text-[0.8rem] tracking-[0.02em] leading-none">MOVIEGROSS</span>
          <div className="rule-double mt-1.5 mb-2" />
          <p className="font-display font-bold text-[1.05rem] leading-[1.15] m-0 truncate">{movie?.title ?? 'Film not found'}</p>
          {rows.length > 0 ? (
            <>
              <p className="text-ink2 text-[0.72rem] font-semibold m-0 mt-2">{rows[0][0]}</p>
              <p className="font-mono font-bold tabular-nums text-[1.9rem] leading-none m-0 mt-0.5">{rows[0][1]}</p>
              <p className="text-ink2 text-[0.72rem] font-semibold m-0 mt-auto">
                {rows[1][0]} <span className="font-mono font-bold text-ink text-[0.85rem] ml-1">{rows[1][1]}</span>
              </p>
            </>
          ) : movie ? (
            <p className="text-ink2 text-[0.8rem] leading-[1.5] m-0 mt-2">No forecast yet. It is filed after the opening weekend.</p>
          ) : null}
        </div>
      </a>
    </main>
  );
}
