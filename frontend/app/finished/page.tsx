'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:5000';

const fmt = (n: number) =>
  '$' + (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : (n / 1e6).toFixed(1) + 'M');

interface FinishedEntry {
  tmdb_id: number;
  title: string;
  poster: string;
  genres: string[];
  predicted_revenue: number;
  actual_revenue: number;
}

export default function FinishedPage() {
  const [entries, setEntries] = useState<FinishedEntry[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    fetch(`${API_URL}/api/finished`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: FinishedEntry[]) => { setEntries(data); setStatus('ok'); })
      .catch(() => setStatus('error'));
  }, []);

  return (
    <main className="min-h-screen bg-transparent text-cream font-sans relative z-[1]">

      <nav className="px-4 sm:px-8 md:px-16 pt-6 sm:pt-8 pb-0 relative z-10 flex items-center gap-6">
        <Link href="/" className="no-underline">
          <span
            className="font-display text-lg font-bold text-green tracking-[0.22em]"
            style={{ textShadow: '0 0 24px color-mix(in srgb, var(--color-green) 25%, transparent)' }}
          >
            MOVIEGROSS
          </span>
        </Link>
        <Link
          href="/"
          className="text-[0.65rem] tracking-[0.18em] text-cream/35 hover:text-cream/65 transition-colors font-semibold font-sans no-underline"
        >
          NOW PLAYING
        </Link>
        <Link
          href="/leaderboard"
          className="text-[0.65rem] tracking-[0.18em] text-cream/35 hover:text-cream/65 transition-colors font-semibold font-sans no-underline"
        >
          RANKINGS
        </Link>
        <span className="text-[0.65rem] tracking-[0.18em] text-green/70 font-semibold font-sans">
          FINISHED
        </span>
      </nav>

      <div className="px-4 sm:px-8 lg:px-16 pt-10 pb-20 max-w-[900px]">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-cream mb-1">Finished Runs</h2>
        <p className="text-cream/35 text-[0.82rem] mb-10">
          Movies that have finished their theatrical run and we predicted for — see how far off we were.
        </p>

        {status === 'loading' && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton-card rounded-lg" style={{ height: 72 }} />
            ))}
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center py-20 text-center">
            <div className="w-12 h-12 rounded-full border border-pink/30 flex items-center justify-center mb-5 text-pink/60 text-xl">!</div>
            <p className="text-cream/60 text-sm font-medium mb-1">Can&apos;t connect to the API</p>
            <p className="text-cream/25 text-[0.78rem]">Make sure the Flask server is running on <span className="font-mono text-green/50">{API_URL}</span></p>
          </div>
        )}

        {status === 'ok' && entries.length === 0 && (
          <div className="flex flex-col items-center py-20 text-center max-w-sm mx-auto">
            <p className="text-[2rem] mb-4">📉</p>
            <p className="text-cream/60 text-sm font-medium mb-2">No finished runs yet</p>
            <p className="text-cream/25 text-[0.78rem] leading-relaxed">Finished runs will appear here after the data is available.</p>
          </div>
        )}

        {status === 'ok' && entries.length > 0 && (
          <div>
            <div className="hidden sm:grid grid-cols-[2rem_1fr_9rem_9rem_9rem] gap-4 px-3 mb-3 items-center">
              <span />
              <span className="text-[0.58rem] tracking-[0.2em] text-cream/22 font-semibold">FILM</span>
              <span className="text-[0.58rem] tracking-[0.2em] text-cream/22 font-semibold text-right">PREDICTED</span>
              <span className="text-[0.58rem] tracking-[0.2em] text-cream/22 font-semibold text-right">ACTUAL</span>
              <span className="text-[0.58rem] tracking-[0.2em] text-cream/22 font-semibold text-right">ERROR</span>
            </div>

            <div className="divide-y divide-green/[0.07]">
              {entries.map((entry, i) => {
                const diff = entry.predicted_revenue - entry.actual_revenue;
                const abs = Math.abs(diff);
                const pct = entry.predicted_revenue > 0 ? (abs / entry.predicted_revenue) * 100 : 0;
                const color = diff > 0 ? 'text-pink' : 'text-green';

                return (
                  <Link key={entry.tmdb_id} href={`/movie/${entry.tmdb_id}`} className="no-underline text-inherit block">
                    <div className="grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2rem_1fr_9rem_9rem_9rem] gap-4 items-center px-3 py-4 rounded-lg hover:bg-green/[0.04] transition-colors">
                      <span className="text-cream/20 text-sm font-mono text-right tabular-nums leading-none">{i + 1}</span>

                      <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0">
                          <Image src={entry.poster} alt={entry.title} width={36} height={54} className="rounded-sm object-cover" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-cream text-sm font-medium truncate leading-tight">{entry.title}</p>
                          {entry.genres.length > 0 && (<p className="text-cream/30 text-[0.68rem] truncate mt-0.5">{entry.genres.slice(0,3).join(' · ')}</p>)}
                        </div>
                      </div>

                      <div className="sm:hidden text-right shrink-0">
                        <p className="font-mono text-[0.5rem] text-cream/25 tracking-[0.14em] mb-0.5">PREDICTED</p>
                        <p className="font-mono text-green text-sm font-bold tabular-nums">{fmt(entry.predicted_revenue)}</p>
                      </div>

                      <div className="hidden sm:block text-right">
                        <p className="font-mono text-cream/45 text-[0.82rem] tabular-nums">{fmt(entry.predicted_revenue)}</p>
                      </div>

                      <div className="hidden sm:block text-right">
                        <p className="font-mono text-cream/70 text-[0.82rem] tabular-nums">{fmt(entry.actual_revenue)}</p>
                      </div>

                      <div className="hidden sm:block text-right">
                        <p className={`font-mono text-[0.82rem] font-bold tabular-nums ${color}`}>{(diff > 0 ? 'Over' : 'Under') } {fmt(abs)}</p>
                        <p className="font-mono text-cream/30 text-[0.7rem]">{pct.toFixed(1)}%</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
