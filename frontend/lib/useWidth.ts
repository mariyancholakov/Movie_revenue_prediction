'use client';
import { useCallback, useState } from 'react';

/** The rendered width of an element, in px, kept current as it resizes; null
 *  until it is first measured. Attach the returned ref to the element. */
export function useWidth(): [(el: HTMLElement | null) => void, number | null] {
  const [width, setWidth] = useState<number | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
