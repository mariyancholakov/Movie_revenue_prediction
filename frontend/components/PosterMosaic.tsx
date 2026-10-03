import { Poster } from './Poster';
import { squarify } from '@/lib/treemap';

interface Film { poster: string; predicted_revenue: number }

// A phone gets the biggest films only: the small ones are specks at this
// strength, and each one is another image to fetch and paint.
const PHONE_FILMS = 18;

/** Posters tiled edge to edge, each one's area following the square root of
 *  its film's predicted gross, so the big films get the big blocks. */
function Tiles({ films, w, h, className }: { films: Film[]; w: number; h: number; className: string }) {
  const rects = squarify(films.map(f => Math.sqrt(f.predicted_revenue)), w, h);
  return (
    <div className={`absolute inset-0 ${className}`}>
      {films.map((f, i) => {
        const r = rects[i];
        return (
          <div
            key={i}
            className="absolute p-[2px]"
            style={{ left: `${(r.x / w) * 100}%`, top: `${(r.y / h) * 100}%`, width: `${(r.w / w) * 100}%`, height: `${(r.h / h) * 100}%` }}
          >
            <div className="relative w-full h-full overflow-hidden bg-panel">
              <Poster src={f.poster} alt="" fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// This week's posters pinned behind the whole page, printed so faintly they
// read as a watermark. The page scrolls over it; body is isolated
// (globals.css) so it still prints behind everything. Decorative only: one
// grayscale filter over the whole mosaic, no animation. The top fades out so
// the nameplate and the page heading stay clean paper.
export function PosterMosaic({ films, ink = 0.07 }: { films: Film[]; ink?: number }) {
  const ranked = films
    .filter(f => f.poster && f.predicted_revenue > 0)
    .sort((a, b) => b.predicted_revenue - a.predicted_revenue);
  if (ranked.length < 6) return null;
  const fade = 'linear-gradient(to bottom, transparent 0%, #000 38%)';
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none grayscale contrast-125"
      style={{ opacity: ink, maskImage: fade, WebkitMaskImage: fade }}
    >
      {/* the layout is worked out for each screen's shape, so tiles stay squarish */}
      <Tiles films={ranked.slice(0, PHONE_FILMS)} w={100} h={215} className="sm:hidden" />
      <Tiles films={ranked} w={160} h={100} className="max-sm:hidden" />
    </div>
  );
}
