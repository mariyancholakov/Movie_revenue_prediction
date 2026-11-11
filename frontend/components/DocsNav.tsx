'use client';
import { useEffect, useState } from 'react';

// The page index, set like the one on How It Works: numbered, sticky beside
// the text, and the current section marked with a red rule.
export function DocsNav({ sections }: { sections: readonly (readonly [string, string])[] }) {
  const [active, setActive] = useState(sections[0][1]);

  // The current section is the last one whose top has passed 40% of the way
  // down the screen.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.4;
      const passed = sections.filter(([, id]) => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= line);
      setActive((passed.at(-1) ?? sections[0])[1]);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [sections]);

  const go = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
  };

  return (
    <nav aria-label="On this page" className="hidden lg:block">
      <ol className="sticky top-8 list-none m-0 p-0">
        {sections.map(([label, id], i) => (
          <li key={id}>
            <a
              href={`#${id}`}
              onClick={e => go(e, id)}
              className={`flex items-baseline gap-3 py-2.5 no-underline text-small transition-colors ${active === id ? 'text-ink font-semibold' : 'text-ink3 hover:text-ink'}`}
            >
              <span className="font-mono text-label w-4 text-right">{i + 1}</span>
              <span className={`border-b-2 ${active === id ? 'border-red' : 'border-transparent'}`}>{label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
