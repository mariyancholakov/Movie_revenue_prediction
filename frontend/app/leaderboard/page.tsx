'use client';
import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { EASE, gsap, motion, useGSAP } from '@/lib/motion';
import { Poster } from '@/components/Poster';
import { RunningHead } from '@/components/RunningHead';
import { WireDown } from '@/components/WireDown';
import { API_URL } from '@/lib/api';
import { estProfit } from '@/lib/profit';
import { fmtMoney } from '@/lib/money';
import { HEAD, NUM, ROW, TINT } from '@/components/ledgerTable';

const fmt = fmtMoney;

// Shared by the column heads and every row, so the two can never drift apart.
const COL = {
  rank: 'w-5 sm:w-7 shrink-0',
  poster: 'hidden sm:block w-12 shrink-0',
  title: 'min-w-0 flex-1 sm:flex-none sm:w-60',
  bar: 'hidden sm:flex flex-1 min-w-0',
  num: 'w-[4.6rem] sm:w-28 shrink-0',
  profit: 'w-[5.25rem] sm:w-28 shrink-0',
};

interface LeaderboardEntry {
  tmdb_id: number;
  title: string;
  poster: string;
  genres: string[];
  opening_weekend: number;
  predicted_revenue: number;
  decay_rate: number | null;
  budget: number | null;
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const chart = useRef<HTMLDivElement>(null);

  // The chart fills in like a printer's proof: rows post top-down and each
  // bar runs out from the left, opening weekend first, then the total.
  useGSAP(() => {
    if (status !== 'ok') return;
    motion(() => {
      gsap.timeline({ defaults: { ease: EASE } })
        .from('[data-row]', { opacity: 0, y: 8, duration: 0.4, stagger: 0.05 })
        .from('[data-bar-total]', { scaleX: 0, transformOrigin: 'left center', duration: 0.9, stagger: 0.05, ease: 'power2.out' }, 0.15)
        .from('[data-bar-open]', { scaleX: 0, transformOrigin: 'left center', duration: 0.6, stagger: 0.05, ease: 'power2.out' }, 0.1)
        .from('[data-tick]', { opacity: 0, duration: 0.3, stagger: 0.05 }, 0.5);
    });
  }, { scope: chart, dependencies: [status] });

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
        <h1 className="font-display text-ink text-[2rem] sm:text-[2.6rem] font-bold leading-none m-0 mb-3">
          Rankings
        </h1>
        <p className="text-ink2 text-[0.88rem] leading-relaxed max-w-xl mb-6">
          Every film now playing that the model has priced, ranked by its predicted worldwide total. Profit is
          estimated as the studio&rsquo;s roughly half of that gross, minus the budget.
        </p>

        <div className="rule-double mb-2" />

        {/* Loading */}
        {status === 'loading' && (
          <div className="space-y-px pt-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="paper-skeleton h-[86px]" />
            ))}
          </div>
        )}

        {/* Error */}
        {status === 'error' && <WireDown className="mt-6" />}

        {/* Empty */}
        {status === 'ok' && entries.length === 0 && (
          <div className="py-16 text-center max-w-md mx-auto">
            <p className="font-display text-ink text-xl font-bold mb-2">The chart is blank</p>
            <p className="text-ink2 text-[0.85rem] leading-relaxed">
              Rankings post here once films are priced.{' '}
              <Link href="/" className="text-ink underline decoration-ink/40 underline-offset-2 hover:decoration-ink">
                Head to Now Playing
              </Link>{' '}
              and run the numbers on any film.
            </p>
          </div>
        )}

        {/* Chart */}
        {status === 'ok' && entries.length > 0 && (
          <div ref={chart} className="border-b border-rule">
            {/* Column heads: each figure is labelled where it sits */}
            <div className={`${ROW} pt-1 pb-2 ${HEAD}`}>
              <span className={`${COL.rank} text-right`}>#</span>
              <span className={COL.poster} />
              <span className={COL.title}>{entries.length} film{entries.length !== 1 ? 's' : ''}</span>
              <span className={`${COL.bar} items-center gap-4`}>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3.5 h-2.5 bg-ink2" /> Opening weekend
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3.5 h-2.5" style={{ background: TINT }} /> Predicted total
                </span>
              </span>
              <span className={`${COL.num} text-right`}>Predicted</span>
              <span className={`${COL.profit} text-right`}>Est. profit</span>
            </div>

            {entries.map((entry, i) => {
              const profit = entry.budget ? estProfit(entry.predicted_revenue, entry.budget) : null;
              const predPct = (entry.predicted_revenue / maxRevenue) * 100;
              const openPct = (entry.opening_weekend / maxRevenue) * 100;

              return (
                <Link
                  key={entry.tmdb_id}
                  href={`/movie/${entry.tmdb_id}`}
                  data-row
                  className="no-underline text-inherit block group ledger-row border-t border-rule"
                >
                  <div className={`${ROW} py-4`}>
                    <span className={`${COL.rank} ${NUM} text-right text-ink3`}>{i + 1}</span>

                    <div className={`${COL.poster} border border-ink/30`}>
                      <Poster src={entry.poster} alt={entry.title} width={46} height={69} className="object-cover block" />
                    </div>

                    <div className={COL.title}>
                      <p className="line-clamp-2 sm:line-clamp-1 leading-tight m-0 text-ink text-[0.92rem] sm:text-[1.02rem] font-semibold group-hover:text-red transition-colors">
                        {entry.title}
                      </p>
                      {entry.genres.length > 0 && (
                        <p className="font-sans text-ink2 text-[0.75rem] truncate mt-1">
                          {entry.genres.slice(0, 2).join(' · ')}
                        </p>
                      )}
                    </div>

                    {/* Opening weekend solid, running on to the predicted total in tint */}
                    <div className={COL.bar}>
                      <div className="relative h-7 w-full">
                        <div data-bar-total className="absolute inset-y-0 left-0" style={{ width: `${predPct}%`, background: TINT }} />
                        <div data-bar-open className="absolute inset-y-0 left-0 bg-ink2" style={{ width: `${openPct}%` }} />
                        <div data-tick className="absolute inset-y-0 w-px bg-paper" style={{ left: `${openPct}%` }} />
                      </div>
                    </div>

                    <p className={`${COL.num} ${NUM} text-right text-ink m-0`}>{fmt(entry.predicted_revenue)}</p>

                    {/* Red when the film is predicted to lose money */}
                    <p
                      className={`${COL.profit} ${NUM} text-right m-0 ${profit != null && profit < 0 ? 'text-red' : 'text-ink'}`}
                      title={profit == null ? 'No budget reported' : undefined}
                    >
                      {profit == null ? '\u2014' : fmt(profit)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
