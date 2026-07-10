'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:5000';

const fmt = (n: number) =>
  '$' + (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : (n / 1e6).toFixed(1) + 'M');

interface LeaderboardEntry {
  tmdb_id: number;
  title: string;
  poster: string;
  genres: string[];
  opening_weekend: number;
  predicted_revenue: number;
  decay_rate: number | null;
}

const MEDAL = [
  {
    border: 'border-[#C9A227]/30',
    bg: 'bg-[#C9A227]/[0.06]',
    badge: 'border-[#C9A227]/50 bg-[#C9A227]/10 text-[#C9A227]',
    bar: 'bg-[#C9A227]/40',
  },
  {
    border: 'border-[#9EA7AA]/25',
    bg: 'bg-[#9EA7AA]/[0.05]',
    badge: 'border-[#9EA7AA]/45 bg-[#9EA7AA]/10 text-[#9EA7AA]',
    bar: 'bg-[#9EA7AA]/35',
  },
  {
    border: 'border-[#B87333]/28',
    bg: 'bg-[#B87333]/[0.06]',
    badge: 'border-[#B87333]/45 bg-[#B87333]/10 text-[#B87333]',
    bar: 'bg-[#B87333]/40',
  },
];

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    fetch(`${API_URL}/api/leaderboard`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: LeaderboardEntry[]) => { setEntries(data); setStatus('ok'); })
      .catch(() => setStatus('error'));
  }, []);

  const maxRevenue = entries[0]?.predicted_revenue ?? 1;

  return (
    <main className="min-h-screen bg-transparent text-cream font-sans relative z-1">

      {/* Nav */}
      <nav className="px-4 sm:px-8 md:px-16 pt-6 sm:pt-8 pb-5 relative z-10 flex items-center justify-between border-b border-green/[0.07]">
        <Link href="/" className="no-underline">
          <span
            className="font-display text-xl font-bold text-green tracking-[0.22em]"
            style={{ textShadow: '0 0 24px color-mix(in srgb, var(--color-green) 25%, transparent)' }}
          >
            MOVIEGROSS
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-[0.65rem] tracking-[0.18em] text-cream/35 hover:text-cream/65 transition-colors font-semibold font-sans no-underline"
          >
            NOW PLAYING
          </Link>
          <span className="text-[0.65rem] tracking-[0.18em] text-green font-semibold font-sans">
            RANKINGS
          </span>
        </div>
      </nav>

      <div className="px-4 sm:px-8 lg:px-16 pt-10 pb-24 max-w-240">

        {/* Page heading */}
        <div className="mb-10">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-cream mb-1.5">
            Box Office Rankings
          </h2>
          <p className="text-cream/35 text-[0.82rem] leading-relaxed">
            Predicted total runs for films currently in theaters — sorted by projected revenue.
            {status === 'ok' && entries.length > 0 && (
              <span className="text-cream/25"> · {entries.length} film{entries.length !== 1 ? 's' : ''} analyzed</span>
            )}
          </p>
        </div>

        {/* Loading */}
        {status === 'loading' && (
          <div className="space-y-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton-card rounded-xl" style={{ height: 82 }} />
            ))}
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="flex flex-col items-center py-20 text-center">
            <div className="w-12 h-12 rounded-full border border-pink/30 flex items-center justify-center mb-5 text-pink/60 text-xl">
              !
            </div>
            <p className="text-cream/60 text-sm font-medium mb-1">Can&apos;t connect to the API</p>
            <p className="text-cream/25 text-[0.78rem]">
              Make sure the Flask server is running on{' '}
              <span className="font-mono text-green/50">{API_URL}</span>
            </p>
          </div>
        )}

        {/* Empty state */}
        {status === 'ok' && entries.length === 0 && (
          <div className="flex flex-col items-center py-20 text-center max-w-sm mx-auto">
            <div
              className="w-16 h-16 rounded-full border border-green/15 flex items-center justify-center mb-5 text-2xl"
              style={{ boxShadow: '0 0 32px color-mix(in srgb, var(--color-green) 8%, transparent)' }}
            >
              🏆
            </div>
            <p className="text-cream/60 text-sm font-medium mb-2">No rankings yet</p>
            <p className="text-cream/25 text-[0.78rem] leading-relaxed">
              Rankings appear here after movies are analyzed.{' '}
              <Link href="/" className="text-green/60 hover:text-green/80 transition-colors underline">
                Go to Now Playing
              </Link>{' '}
              and hit &ldquo;Predict Revenue&rdquo; on any film to get started.
            </p>
          </div>
        )}

        {/* Rankings list */}
        {status === 'ok' && entries.length > 0 && (
          <div>
            {/* Column headers */}
            <div className="hidden sm:grid grid-cols-[3.5rem_1fr_9rem_11rem_7rem] gap-4 px-4 mb-2.5">
              <span />
              <span className="text-[0.58rem] tracking-[0.2em] text-cream/20 font-semibold">FILM</span>
              <span className="text-[0.58rem] tracking-[0.2em] text-cream/20 font-semibold text-right">OPENING WKD</span>
              <span className="text-[0.58rem] tracking-[0.2em] text-cream/20 font-semibold text-right">PREDICTED TOTAL</span>
              <span className="text-[0.58rem] tracking-[0.2em] text-cream/20 font-semibold text-right">MULT.</span>
            </div>

            <div className="space-y-2">
              {entries.map((entry, i) => {
                const multiplier = entry.predicted_revenue / entry.opening_weekend;
                const multColor =
                  multiplier >= 3.5 ? 'text-green' :
                  multiplier >= 2.5 ? 'text-cream/60' :
                  'text-pink';
                const barPct = (entry.predicted_revenue / maxRevenue) * 100;
                const medal = i < 3 ? MEDAL[i] : null;

                return (
                  <Link
                    key={entry.tmdb_id}
                    href={`/movie/${entry.tmdb_id}`}
                    className="no-underline text-inherit block group"
                  >
                    <div
                      className={`
                        relative rounded-xl overflow-hidden border transition-all duration-300
                        ${medal
                          ? `${medal.border} ${medal.bg} hover:brightness-110`
                          : 'border-green/[0.07] bg-green/2 hover:border-green/13 hover:bg-green/4.5'
                        }
                      `}
                    >
                      {/* Revenue bar */}
                      <div
                        className={`absolute bottom-0 left-0 h-0.5 transition-all duration-700 ${medal ? medal.bar : 'bg-green/20'}`}
                        style={{ width: `${barPct}%` }}
                      />

                      <div className="grid grid-cols-[3.5rem_1fr_auto] sm:grid-cols-[3.5rem_1fr_9rem_11rem_7rem] gap-4 items-center px-4 py-3.5">

                        {/* Rank */}
                        <div className="flex items-center justify-center">
                          {medal ? (
                            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${medal.badge}`}>
                              {i + 1}
                            </span>
                          ) : (
                            <span className="text-cream/20 text-sm font-mono tabular-nums text-center w-7 leading-none">
                              {i + 1}
                            </span>
                          )}
                        </div>

                        {/* Poster + title */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="shrink-0">
                            <Image
                              src={entry.poster}
                              alt={entry.title}
                              width={medal ? 48 : 42}
                              height={medal ? 72 : 63}
                              className="rounded-sm object-cover"
                              style={medal ? { boxShadow: '0 4px 14px rgba(0,0,0,0.55)' } : undefined}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate leading-tight mb-0.5 text-cream">
                              {entry.title}
                            </p>
                            {entry.genres.length > 0 && (
                              <p className="text-cream/45 text-[0.67rem] truncate">
                                {entry.genres.slice(0, 3).join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Mobile: predicted only */}
                        <div className="sm:hidden text-right shrink-0">
                          <p className="font-mono text-[0.5rem] text-cream/25 tracking-[0.14em] mb-0.5">PREDICTED</p>
                          <p className="font-mono text-green text-sm font-bold tabular-nums" style={{ textShadow: '0 0 16px rgba(234,180,76,0.3)' }}>
                            {fmt(entry.predicted_revenue)}
                          </p>
                        </div>

                        {/* Desktop: opening */}
                        <div className="hidden sm:block text-right">
                          <p className="font-mono text-cream/55 text-[0.82rem] tabular-nums">
                            {fmt(entry.opening_weekend)}
                          </p>
                        </div>

                        {/* Desktop: predicted total */}
                        <div className="hidden sm:block text-right">
                          <p
                            className="font-mono text-green font-bold text-[0.9rem] tabular-nums"
                            style={{ textShadow: '0 0 20px rgba(234,180,76,0.28)' }}
                          >
                            {fmt(entry.predicted_revenue)}
                          </p>
                        </div>

                        {/* Desktop: multiplier */}
                        <div className="hidden sm:block text-right">
                          <p className={`font-mono text-[0.9rem] font-bold tabular-nums ${multColor}`}>
                            {multiplier.toFixed(1)}×
                          </p>
                        </div>

                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            <p className="text-cream/12 text-[0.65rem] tracking-[0.18em] mt-10 text-center">
              MULTIPLIER = PREDICTED TOTAL ÷ OPENING WEEKEND
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
