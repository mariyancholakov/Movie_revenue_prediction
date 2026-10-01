import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Movie } from '@/components/types';
import { fmtMoney } from '@/lib/money';
import { fetchList } from '@/lib/serverApi';

// The card a film's link unfurls into (WhatsApp, iMessage, X, Slack): the
// poster and the model's call, set like a ledger entry. The call comes from
// the Rankings and Ledger lists, so making a card never asks the API to
// scrape or predict anything.
export const alt = 'MOVIEGROSS — the predicted box-office run';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const PAPER = '#EDE7DA', INK = '#1C1814', INK2 = '#554D40';

const fontDir = join(process.cwd(), 'app/movie/[id]/fonts');
const fonts = Promise.all([
  readFile(join(fontDir, 'bodoni-moda-latin-900-normal.woff')),
  readFile(join(fontDir, 'courier-prime-latin-700-normal.woff')),
  readFile(join(fontDir, 'libre-franklin-latin-600-normal.woff')),
]);

type Ranked = { tmdb_id: number; predicted_revenue: number; opening_weekend: number };
type Settled = { tmdb_id: number; predicted_revenue: number; actual_revenue: number };

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tmdbId = Number(id);
  const [movie, ranked, settled, [bodoni, courier, franklin]] = await Promise.all([
    fetchList<Movie>(`/api/movie/${tmdbId}`, 3600),
    fetchList<Ranked[]>('/api/leaderboard', 300),
    fetchList<Settled[]>('/api/finished', 300),
    fonts,
  ]);
  const live = ranked?.find(r => r.tmdb_id === tmdbId);
  const done = settled?.find(r => r.tmdb_id === tmdbId);

  const title = movie?.title ?? 'MOVIEGROSS';
  // Only a film that is out or coming soon is waiting on its opening weekend.
  const recent = !!movie?.release_date && Date.parse(movie.release_date) > Date.now() - 90 * 864e5;
  const year = movie?.release_date?.slice(0, 4);
  // [label, figure] pairs, the way the page prints them
  const figures: [string, string][] = done
    ? [['PREDICTED', fmtMoney(done.predicted_revenue)], ['SETTLED AT', fmtMoney(done.actual_revenue)]]
    : live
    ? [['PREDICTED WORLDWIDE TOTAL', fmtMoney(live.predicted_revenue)], ['OPENING WEEKEND', fmtMoney(live.opening_weekend)]]
    : [];

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: PAPER, color: INK, padding: 56 }}>
        {movie?.poster ? (
          <img src={movie.poster} width={348} height={518} alt="" style={{ border: `2px solid ${INK}`, objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 348, height: 518, border: `2px solid ${INK}`, background: '#E4DCC9' }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginLeft: 56, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontFamily: 'Bodoni', fontSize: 34, letterSpacing: -0.5 }}>MOVIEGROSS</div>
            <div style={{ display: 'flex', width: '100%', height: 4, marginTop: 10, borderTop: `2px solid ${INK}`, borderBottom: `1px solid ${INK}` }} />
            <div style={{ display: 'flex', fontFamily: 'Bodoni', fontSize: title.length > 28 ? 56 : title.length > 16 ? 64 : 76, lineHeight: 1.02, marginTop: 36 }}>
              {title}
            </div>
            {year && <div style={{ display: 'flex', fontFamily: 'Franklin', fontSize: 26, color: INK2, marginTop: 14 }}>{year}</div>}
          </div>

          {figures.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28 }}>
              <div style={{ display: 'flex', fontFamily: 'Franklin', fontSize: 24, color: INK2 }}>{figures[0][0]}</div>
              <div style={{ display: 'flex', fontFamily: 'Courier', fontSize: 112, lineHeight: 1, marginTop: 6 }}>{figures[0][1]}</div>
              <div style={{ display: 'flex', width: '100%', height: 4, marginTop: 18, borderTop: `2px solid ${INK}`, borderBottom: `1px solid ${INK}` }} />
              <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 16 }}>
                <div style={{ display: 'flex', fontFamily: 'Franklin', fontSize: 24, color: INK2 }}>{figures[1][0]}</div>
                <div style={{ display: 'flex', fontFamily: 'Courier', fontSize: 38, marginLeft: 18 }}>{figures[1][1]}</div>
              </div>
            </div>
          ) : recent ? (
            <div style={{ display: 'flex', fontFamily: 'Franklin', fontSize: 30, color: INK2 }}>
              The forecast is filed after the opening weekend.
            </div>
          ) : (
            <div style={{ display: 'flex' }} />
          )}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Bodoni', data: bodoni, weight: 900, style: 'normal' },
        { name: 'Courier', data: courier, weight: 700, style: 'normal' },
        { name: 'Franklin', data: franklin, weight: 600, style: 'normal' },
      ],
    }
  );
}
