import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// The card the site's own links unfurl into (home, Rankings, the Ledger, How
// It Works): the light icon on newsprint beside the nameplate. A film's link
// has its own card, with the poster and the call.
export const alt = 'MOVIEGROSS — The Box-Office Ledger';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const PAPER = '#EDE7DA', INK = '#1C1814', INK2 = '#554D40', RED = '#C02820';

const fontDir = join(process.cwd(), 'app/movie/[id]/fonts');
const fonts = Promise.all([
  readFile(join(fontDir, 'bodoni-moda-latin-900-normal.woff')),
  readFile(join(fontDir, 'libre-franklin-latin-600-normal.woff')),
]);

export default async function Image() {
  const [bodoni, franklin] = await fonts;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', background: PAPER, color: INK, padding: 72 }}>
        <svg width={360} height={360} viewBox="0 0 1024 1024" style={{ border: `2px solid ${INK}`, flexShrink: 0 }}>
          <rect width="1024" height="1024" fill={PAPER} />
          <path fill={INK} d="M228 716 L228 420 L352 420 L500 568 L688 333 L688 481 L500 716 L352 568 L352 716 Z" />
          <rect x="648" y="272" width="124" height="444" fill={RED} />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginLeft: 64 }}>
          <div style={{ display: 'flex', fontFamily: 'Bodoni', fontSize: 88, letterSpacing: -1.5, lineHeight: 1 }}>MOVIEGROSS</div>
          <div style={{ display: 'flex', width: '100%', height: 4, marginTop: 22, borderTop: `2px solid ${INK}`, borderBottom: `1px solid ${INK}` }} />
          <div style={{ display: 'flex', fontFamily: 'Bodoni', fontSize: 44, marginTop: 28 }}>The Box-Office Ledger</div>
          <div style={{ display: 'flex', fontFamily: 'Franklin', fontSize: 30, lineHeight: 1.35, color: INK2, marginTop: 20 }}>
            The predicted worldwide run of every film now playing, settled against the real result.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Bodoni', data: bodoni, weight: 900, style: 'normal' },
        { name: 'Franklin', data: franklin, weight: 600, style: 'normal' },
      ],
    }
  );
}
