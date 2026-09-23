import { Poster } from './Poster';

// Paper-coloured sprocket holes along both edges of the ink strip, one pair
// per 18px, as a tile each copy of the strip carries (so the loop never jumps).
const HOLES = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="136">' +
  '<rect x="4" y="5" width="10" height="9" rx="1.5" fill="#EDE7DA"/>' +
  '<rect x="4" y="122" width="10" height="9" rx="1.5" fill="#EDE7DA"/>' +
  '</svg>'
)}")`;

// A ghost of a film strip crossing behind a page heading on the diagonal,
// its frames holding this week's posters, printed so faintly they read as
// a watermark. It feeds slowly sideways (reduced motion: it holds still).
// The parent must be `relative isolate` so the reel prints on the paper,
// behind the heading. With `fixed` it is pinned to the screen instead and the
// page scrolls over it; body is isolated (globals.css) so it still prints
// behind everything. Decorative only.
export function GhostReel({ posters, tilt = -5, size = 1, fixed = false, top = '46%', ink = 0.06 }: {
  posters: string[];
  /** degrees the strip leans; flatter where the heading is wide */
  tilt?: number;
  /** scale of the strip (phones get 60% of it) */
  size?: number;
  /** pin it to the screen, behind the whole page, rather than to its parent */
  fixed?: boolean;
  /** where the strip's centre sits, down its parent (or the screen) */
  top?: string;
  /** how strongly it prints (opacity) */
  ink?: number;
}) {
  if (posters.length < 4) return null;

  const run = (copy: number) => (
    <div
      className="flex shrink-0 gap-[10px] px-[5px] py-[20px] bg-ink"
      style={{ backgroundImage: HOLES, backgroundRepeat: 'repeat-x' }}
    >
      {posters.map((src, i) => (
        <div key={`${copy}-${i}`} className="relative w-[150px] h-[96px] overflow-hidden bg-paper">
          <Poster src={src} alt="" fill sizes="150px" className="object-cover grayscale contrast-125" />
        </div>
      ))}
    </div>
  );

  return (
    <div
      aria-hidden
      className={`${fixed ? 'fixed' : 'absolute'} left-1/2 w-[300vw] sm:w-[170vw] scale-[calc(var(--reel-size)*0.6)] sm:scale-[var(--reel-size)] -translate-x-1/2 -translate-y-1/2 -z-10 pointer-events-none select-none overflow-hidden`}
      style={{ top, opacity: ink, rotate: `${tilt}deg`, ['--reel-size' as string]: size }}
    >
      <div className="reel-track reel-in flex w-max">
        {run(0)}
        {run(1)}
      </div>
    </div>
  );
}
