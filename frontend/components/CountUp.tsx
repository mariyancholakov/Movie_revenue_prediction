'use client';
import { useEffect, useRef, useState } from 'react';

interface CountUpProps {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
  className?: string;
  style?: React.CSSProperties;
}

// The predicted total totes up like an adding machine when the numbers land.
// Reduced-motion (or SSR) shows the settled figure immediately.
export function CountUp({ value, format, durationMs = 950, className, style }: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduce || value === 0) {
      setDisplay(value);
      return;
    }

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
  }, [value, durationMs]);

  return (
    <span className={className} style={style}>
      {format(display)}
    </span>
  );
}
