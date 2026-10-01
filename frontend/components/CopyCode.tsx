'use client';
import { useState } from 'react';

// A code sample that wraps rather than scrolls, with a quiet copy link.
export function CopyCode({ children, label }: { children: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2000);
  };
  return (
    <div className="relative my-3">
      <pre className="font-mono text-ink text-[0.78rem] sm:text-[0.85rem] leading-[1.6] bg-panel border border-ink/20 pl-4 pr-20 py-3 m-0 whitespace-pre-wrap break-words">
        {children}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="absolute top-0 right-0 px-3.5 py-3 font-sans text-[0.75rem] font-semibold tracking-[0.1em] text-ink2 underline decoration-ink/30 underline-offset-4 bg-transparent border-0 cursor-pointer hover:text-ink"
      >
        {state === 'copied' ? (
          <span className="inline-flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" aria-hidden>
              <path d="M1.5 6.5 4.5 9.5 10.5 2.5" />
            </svg>
            Copied
          </span>
        ) : state === 'failed' ? 'Failed' : 'Copy'}
      </button>
      <span role="status" className="sr-only">{state === 'copied' ? 'Copied to clipboard' : ''}</span>
    </div>
  );
}
