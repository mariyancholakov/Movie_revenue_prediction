// Ambient cinema backdrop: a warm projector wash from the top, a faint plum
// pool at the lower edge, and a soft vignette. Static and quiet — the marquee
// bulbs in the hero carry the motion.
export function BackgroundThreads() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        background: [
          // projector beam, warm gold from top-center
          'radial-gradient(120% 80% at 50% -18%, color-mix(in srgb, #EAB44C 12%, transparent) 0%, transparent 58%)',
          // faint theatrical pool, bottom-left
          'radial-gradient(70% 55% at 8% 108%, color-mix(in srgb, #6C5A8C 16%, transparent) 0%, transparent 60%)',
          // whisper of red curtain, right edge
          'radial-gradient(60% 50% at 108% 82%, color-mix(in srgb, #E5484D 7%, transparent) 0%, transparent 55%)',
          // vignette
          'radial-gradient(130% 120% at 50% 40%, transparent 60%, rgba(0,0,0,0.45) 100%)',
        ].join(', '),
      }}
    />
  );
}
