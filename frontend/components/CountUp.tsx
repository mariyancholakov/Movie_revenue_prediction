'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

interface CountUpProps {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
  className?: string;
  style?: React.CSSProperties;
}

// prefers-reduced-motion as an SSR-safe external store: no setState-in-effect,
// and the server snapshot assumes "reduced" so SSR renders the settled figure.
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const subscribeReducedMotion = (cb: () => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const getReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED_MOTION_QUERY).matches;
const getServerReducedMotion = () => true;

// The predicted total totes up like an adding machine when the numbers land.
// Reduced-motion (or SSR) shows the settled figure immediately.
export function CountUp({ value, format, durationMs = 950, className, style }: CountUpProps) {
  const prefersReduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getServerReducedMotion
  );
  const animate = !prefersReduced && value !== 0;

  const [display, setDisplay] = useState(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!animate) return; // reduced motion / zero → the value is rendered directly

    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // exponential ease-out
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [animate, value, durationMs]);

  return (
    <span className={className} style={style}>
      {format(animate ? display : value)}
    </span>
  );
}
