'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';

export function Header() {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const trigger = () => {
      const el = titleRef.current;
      if (!el) return;
      el.classList.add('is-waving');
      setTimeout(() => el.classList.remove('is-waving'), 1200);
    };
    const id = setInterval(trigger, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="flex flex-col items-center text-center pt-10 sm:pt-18 pb-6 sm:pb-8 px-5 sm:px-8 relative z-1">
      <Link href="/" className="no-underline">
        <h1
          ref={titleRef}
          className="title-wave font-display text-[2rem] sm:text-[3.75rem] font-black text-green tracking-[0.1em] sm:tracking-[0.2em] mt-0 mb-3 sm:mb-[1.1rem]"
          style={{ textShadow: '0 0 40px color-mix(in srgb, var(--color-green) 28%, transparent)' }}
        >
          {['M','O','V','I','E','G','R','O','S','S'].map((l, i) => (
            <span key={i} className="wave-letter" style={{ animationDelay: `${i * 0.045}s` }}>
              {l}
            </span>
          ))}
        </h1>
      </Link>
      <p className="text-cream/80 text-[0.82rem] sm:text-[0.95rem] max-w-2xl leading-[1.65] m-0 font-sans font-normal px-2 sm:px-0">
        Predict the total box office run of any film currently in theaters —{' '}
        powered by machine learning trained on 5,000+ films.
      </p>
      <nav className="flex gap-5 mt-5">
        <Link
          href="/leaderboard"
          className="text-[0.65rem] tracking-[0.18em] text-cream/35 hover:text-cream/65 transition-colors font-semibold font-sans no-underline"
        >
          RANKINGS
        </Link>
      </nav>
    </header>
  );
}
