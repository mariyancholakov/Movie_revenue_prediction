'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { RunningHead } from '@/components/RunningHead';

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
    <main className="min-h-screen text-ink font-sans">
      <RunningHead active="rankings" />

      <div className="px-4 sm:px-8 lg:px-14 pt-9 pb-24 max-w-[74rem] mx-auto w-full">
        {/* Heading */}
        <div className="flex items-end justify-between gap-4 mb-3">
          <h1 className="font-display text-ink text-[2rem] sm:text-[2.6rem] font-bold leading-none m-0">
            Box-Office Rankings
          </h1>
          {status === 'ok' && entries.length > 0 && (
            <span className="font-mono text-ink2 text-[0.66rem] tracking-[0.1em] pb-1.5 whitespace-nowrap">
              {entries.length} FILM{entries.length !== 1 ? 'S' : ''} PRICED
            </span>
          )}
        </div>
        <p className="text-ink2 text-[0.88rem] leading-relaxed max-w-xl mb-3">
          Every film now playing, ranked by the model&rsquo;s predicted total run.
        </p>

        {/* Legend */}
        {status === 'ok' && entries.length > 0 && (
          <div className="hidden sm:flex items-center gap-5 font-mono text-[0.6rem] tracking-[0.08em] text-ink3 uppercase mb-2">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-2.5 bg-ink2" /> Opening weekend
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-2.5" style={{ background: 'color-mix(in srgb, var(--color-ink2) 30%, transparent)' }} /> → Predicted total
            </span>
          </div>
        )}
        <div className="rule-double mb-2" />

        {/* Loading */}
        {status === 'loading' && (
          <div className="space-y-px pt-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="paper-skeleton h-[70px]" />
            ))}
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="border border-ink/25 bg-panel/50 px-6 py-8 text-center mt-6">
            <p className="font-display text-ink text-lg font-bold mb-1.5">The wire is down</p>
            <p className="text-ink2 text-[0.85rem] m-0">
              No connection to the box-office desk. Start the Flask server on{' '}
              <span className="font-mono text-ink">{API_URL}</span>.
            </p>
          </div>
        )}

        {/* Empty */}
        {status === 'ok' && entries.length === 0 && (
          <div className="py-16 text-center max-w-md mx-auto">
            <p className="font-display text-ink text-xl font-bold mb-2">The chart is blank</p>
            <p className="text-ink2 text-[0.85rem] leading-relaxed">
              Rankings post here once films are priced.{' '}
              <Link href="/" className="text-red underline underline-offset-2 hover:no-underline">
                Head to Now Playing
              </Link>{' '}
              and run the numbers on any film.
            </p>
          </div>
        )}

        {/* Chart */}
        {status === 'ok' && entries.length > 0 && (
          <div className="border-b border-rule">
            {entries.map((entry, i) => {
              const multiplier = entry.predicted_revenue / Math.max(entry.opening_weekend, 1);
              const multColor =
                multiplier >= 3.5 ? 'text-ink font-bold' :
                multiplier >= 2.5 ? 'text-ink' :
                'text-red';
              const predPct = (entry.predicted_revenue / maxRevenue) * 100;
              const openPct = (entry.opening_weekend / maxRevenue) * 100;
              const lead = i === 0;

              return (
                <Link
                  key={entry.tmdb_id}
                  href={`/movie/${entry.tmdb_id}`}
                  className="no-underline text-inherit block group ledger-row border-t border-rule"
                >
                  <div className="flex items-center gap-3 sm:gap-5 px-2 sm:px-3 py-3.5">
                    {/* Rank */}
                    <span className={`font-mono tabular-nums text-right w-5 sm:w-7 shrink-0 ${lead ? 'text-red text-[1.05rem] sm:text-[1.2rem] font-bold' : 'text-ink3 text-[0.9rem] sm:text-[0.95rem]'}`}>
                      {i + 1}
                    </span>

                    {/* Poster */}
                    <div className="shrink-0 border border-ink/30">
                      <Image
                        src={entry.poster}
                        alt={entry.title}
                        width={lead ? 44 : 38}
                        height={lead ? 66 : 57}
                        className="object-cover block"
                      />
                    </div>

                    {/* Title */}
                    <div className="min-w-0 flex-1 sm:flex-none sm:w-52">
                      <p className={`truncate leading-tight m-0 text-ink group-hover:text-red transition-colors ${lead ? 'text-[0.95rem] sm:text-[1rem] font-bold' : 'text-[0.85rem] sm:text-[0.9rem] font-semibold'}`}>
                        {entry.title}
                      </p>
                      {entry.genres.length > 0 && (
                        <p className="font-mono text-ink3 text-[0.6rem] tracking-[0.06em] truncate mt-0.5 uppercase">
                          {entry.genres.slice(0, 2).join(' · ')}
                        </p>
                      )}
                    </div>

                    {/* Bar (desktop) — opening weekend solid, extended to predicted total in tint */}
                    <div className="hidden sm:block flex-1 min-w-0">
                      <div className="relative h-6 w-full">
                        <div
                          className="absolute inset-y-0 left-0"
                          style={{ width: `${predPct}%`, background: 'color-mix(in srgb, var(--color-ink2) 28%, transparent)' }}
                        />
                        <div className="absolute inset-y-0 left-0 bg-ink2" style={{ width: `${openPct}%` }} />
                        {/* opening/total boundary tick */}
                        <div className="absolute inset-y-0 w-px bg-paper" style={{ left: `${openPct}%` }} />
                      </div>
                    </div>

                    {/* Predicted total */}
                    <p className={`text-right font-mono tabular-nums m-0 w-[5.5rem] sm:w-24 shrink-0 text-ink ${lead ? 'text-[0.98rem] sm:text-[1.05rem] font-bold' : 'text-[0.9rem] sm:text-[0.95rem] font-bold'}`}>
                      {fmt(entry.predicted_revenue)}
                    </p>

                    {/* Multiplier */}
                    <p className={`text-right font-mono text-[0.82rem] sm:text-[0.9rem] tabular-nums m-0 w-11 sm:w-12 shrink-0 ${multColor}`}>
                      {multiplier.toFixed(1)}×
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {status === 'ok' && entries.length > 0 && (
          <p className="font-mono text-ink3 text-[0.6rem] tracking-[0.13em] mt-8 uppercase">
            Multiplier = predicted total ÷ opening weekend · bars to scale
          </p>
        )}
      </div>
    </main>
  );
}
