'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { RunningHead } from '@/components/RunningHead';
import { WireDown } from '@/components/WireDown';

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

  // Median, not mean: a handful of small releases the model overshoots by
  // thousands of percent would otherwise swamp the headline figure. Every miss
  // still appears in the table below.
  const medianError = useMemo(() => {
    const errs = entries
      .filter(e => e.actual_revenue > 0)
      .map(e => Math.abs(e.predicted_revenue - e.actual_revenue) / e.actual_revenue)
      .sort((a, b) => a - b);
    if (!errs.length) return null;
    const mid = Math.floor(errs.length / 2);
    const median = errs.length % 2 ? errs[mid] : (errs[mid - 1] + errs[mid]) / 2;
    return median * 100;
  }, [entries]);

  const maxVal = useMemo(
    () => Math.max(1, ...entries.map(e => Math.max(e.predicted_revenue, e.actual_revenue))),
    [entries]
  );

  return (
    <main className="min-h-screen text-ink font-sans">
      <RunningHead active="finished" />

      <div className="px-4 sm:px-8 lg:px-14 pt-9 pb-24 max-w-[74rem] mx-auto w-full">
        <h1 className="font-display text-ink text-[2rem] sm:text-[2.6rem] font-bold leading-none m-0 mb-3">
          The Ledger
        </h1>
        <p className="text-ink2 text-[0.88rem] leading-relaxed max-w-xl mb-5">
          Films whose theatrical runs have closed — the model&rsquo;s call, settled against the
          final worldwide gross. Overshoots post <span className="text-red font-semibold">in&nbsp;the&nbsp;red</span>.
        </p>

        {/* Aggregate proof */}
        {status === 'ok' && entries.length > 0 && medianError != null && (
          <div className="flex flex-wrap gap-x-10 gap-y-3 border-y border-ink/25 py-5 mb-6">
            <div>
              <p className="font-mono text-[0.56rem] tracking-[0.16em] text-ink3 uppercase mb-1.5">Settled</p>
              <p className="font-mono text-ink text-[1.4rem] font-bold tabular-nums m-0">{entries.length}</p>
            </div>
            <div>
              <p className="font-mono text-[0.56rem] tracking-[0.16em] text-ink3 uppercase mb-1.5">Median Error</p>
              <p className="font-mono text-ink text-[1.4rem] font-bold tabular-nums m-0">{medianError.toFixed(1)}%</p>
            </div>
            <div>
              <p className="font-mono text-[0.56rem] tracking-[0.16em] text-ink3 uppercase mb-1.5">Within 20%</p>
              <p className="font-mono text-ink text-[1.4rem] font-bold tabular-nums m-0">
                {Math.round(
                  (entries.filter(e => e.actual_revenue > 0 &&
                    Math.abs(e.predicted_revenue - e.actual_revenue) / e.actual_revenue <= 0.2).length /
                    entries.length) * 100
                )}%
              </p>
            </div>
          </div>
        )}

        {/* Legend */}
        {status === 'ok' && entries.length > 0 && (
          <div className="hidden sm:flex items-center gap-5 font-mono text-[0.6rem] tracking-[0.08em] text-ink3 uppercase mb-2">
            <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-2.5 bg-ink2" /> Actual worldwide gross</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block" style={{ width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '6px solid var(--color-ink)' }} /> Predicted
            </span>
            <span className="flex items-center gap-1.5"><span className="text-red font-semibold not-italic">Over</span> = model overshot</span>
          </div>
        )}
        <div className="rule-double mb-2" />

        {status === 'loading' && (
          <div className="space-y-px pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="paper-skeleton h-[66px]" />
            ))}
          </div>
        )}

        {status === 'error' && <WireDown className="mt-6" />}

        {status === 'ok' && entries.length === 0 && (
          <div className="py-16 text-center max-w-md mx-auto">
            <p className="font-display text-ink text-xl font-bold mb-2">The ledger is empty</p>
            <p className="text-ink2 text-[0.85rem] leading-relaxed m-0">
              Settled runs post here once films close out their theatrical release.
            </p>
          </div>
        )}

        {status === 'ok' && entries.length > 0 && (
          <div className="border-b border-rule">
            {entries.map((entry) => {
              const diff = entry.predicted_revenue - entry.actual_revenue;
              const abs = Math.abs(diff);
              const pct = entry.actual_revenue > 0 ? (abs / entry.actual_revenue) * 100 : 0;
              const over = diff > 0;
              const color = over ? 'text-red' : 'text-ink';
              const actualPct = (entry.actual_revenue / maxVal) * 100;
              const predPct = (entry.predicted_revenue / maxVal) * 100;

              return (
                <Link key={entry.tmdb_id} href={`/movie/${entry.tmdb_id}`} className="no-underline text-inherit block group ledger-row border-t border-rule">
                  <div className="flex items-center gap-3 sm:gap-5 px-2 sm:px-3 py-3.5">
                    {/* Film */}
                    <div className="shrink-0 border border-ink/30">
                      <Image src={entry.poster} alt={entry.title} width={36} height={54} className="object-cover block" />
                    </div>
                    <div className="min-w-0 w-[9rem] sm:w-52 shrink-0">
                      <p className="text-ink text-[0.85rem] sm:text-[0.9rem] font-semibold truncate leading-tight m-0 group-hover:text-red transition-colors">
                        {entry.title}
                      </p>
                      {entry.genres.length > 0 && (
                        <p className="font-mono text-ink3 text-[0.6rem] tracking-[0.06em] truncate mt-0.5 uppercase">
                          {entry.genres.slice(0, 2).join(' · ')}
                        </p>
                      )}
                    </div>

                    {/* Bar (desktop): actual gross in ink, overshoot in red, predicted tick */}
                    <div className="hidden sm:block flex-1 min-w-0">
                      <div className="relative h-6 w-full">
                        {/* actual gross — the truth */}
                        <div className="absolute inset-y-0 left-0 bg-ink2" style={{ width: `${actualPct}%` }} />
                        {/* faint trace of the overshoot, past the actual bar (over only) */}
                        {over && (
                          <div
                            className="absolute inset-y-0"
                            style={{ left: `${actualPct}%`, width: `${predPct - actualPct}%`, background: 'color-mix(in srgb, var(--color-red) 50%, transparent)' }}
                          />
                        )}
                        {/* predicted — an ink caret above the bar (always legible) */}
                        <div
                          className="absolute"
                          style={{ left: `calc(${predPct}% - 4px)`, top: '-7px', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '6px solid var(--color-ink)' }}
                        />
                      </div>
                    </div>

                    {/* Mobile: error only */}
                    <div className="sm:hidden text-right shrink-0 ml-auto">
                      <p className={`font-mono text-[0.85rem] font-bold tabular-nums m-0 ${color}`}>
                        {over ? 'Over' : 'Under'} {fmt(abs)}
                      </p>
                      <p className="font-mono text-ink3 text-[0.66rem] tabular-nums m-0">{pct.toFixed(1)}%</p>
                    </div>

                    {/* Actual */}
                    <p className="hidden sm:block text-right font-mono text-ink text-[0.9rem] font-bold tabular-nums m-0 w-24 shrink-0">
                      {fmt(entry.actual_revenue)}
                    </p>
                    {/* Error */}
                    <div className="hidden sm:block text-right w-28 shrink-0">
                      <p className={`font-mono text-[0.85rem] font-bold tabular-nums m-0 ${color}`}>
                        {over ? 'Over' : 'Under'} {fmt(abs)}
                      </p>
                      <p className="font-mono text-ink3 text-[0.66rem] tabular-nums m-0">{pct.toFixed(1)}%</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {status === 'ok' && entries.length > 0 && (
          <p className="font-mono text-ink3 text-[0.6rem] tracking-[0.13em] uppercase mt-4">
            Bars to scale · error relative to final worldwide gross
          </p>
        )}
      </div>
    </main>
  );
}
