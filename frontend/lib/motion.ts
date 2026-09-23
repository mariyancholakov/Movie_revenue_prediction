'use client';
// GSAP, registered once for every client component that animates.
//
// House rules for motion on MOVIEGROSS: a few print-shop moments (type
// setting, ink rules drawing, bars filling), each short, each played once, and
// none at all under prefers-reduced-motion. Wrap every animation in
// `motion(() => ...)` so the reduced-motion check is never forgotten.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);
// Timelines target optional parts (a chart, a settled-run note) by selector.
gsap.config({ nullTargetWarn: false });

export const EASE = 'power3.out';

/** Run `build` only when the reader hasn't asked for reduced motion. Call it
 *  inside useGSAP so the matchMedia context is reverted on unmount. */
export function motion(build: () => void) {
  gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', build);
}

export { gsap, ScrollTrigger, useGSAP };
