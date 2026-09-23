'use client';
import { useRef, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { EASE, gsap, motion, useGSAP } from '@/lib/motion';
import { Poster } from '@/components/Poster';
import { RunningHead } from '@/components/RunningHead';
import { WireDown } from '@/components/WireDown';
import { API_URL } from '@/lib/api';

const fmt = (n: number) =>
  '$' + (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : (n / 1e6).toFixed(1) + 'M');
// Signed: + when the model called it high, \u2212 when it called it low.
const fmtDiff = (n: number) => (n > 0 ? '+' : n < 0 ? '\u2212' : '') + fmt(Math.abs(n));

// Shared by the column heads and every row, so the two can never drift apart.
const ROW = 'flex items-center gap-3 sm:gap-5 px-2 sm:px-3';
const COL = {
  poster: 'w-[38px] shrink-0',
  title: 'min-w-0 flex-1 sm:flex-none sm:w-52',
  bar: 'hidden sm:flex flex-1 min-w-0',
  num: 'hidden sm:block w-24 shrink-0',
  diff: 'w-[5.5rem] sm:w-24 shrink-0',
};
const HEAD = 'font-mono text-[0.58rem] tracking-[0.14em] text-ink3 uppercase';
const NUM = 'font-mono tabular-nums text-[0.82rem] sm:text-[0.9rem]';
// The same two tones as Rankings: solid for real grosses, tint for the model.
const TINT = 'color-mix(in srgb, var(--color-ink2) 30%, transparent)';

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
  const chart = useRef<HTMLDivElement>(null);

  // Settling the books: rows post top-down, the model's call runs out from
  // the left, then the actual gross runs out beneath it.
  useGSAP(() => {
    if (status !== 'ok') return;
    motion(() => {
      gsap.timeline({ defaults: { ease: EASE } })
        .from('[data-row]', { opacity: 0, y: 8, duration: 0.4, stagger: 0.05 })
        .from('[data-bar-pred]', { scaleX: 0, transformOrigin: 'left center', duration: 0.8, stagger: 0.05, ease: 'power2.out' }, 0.1)
        .from('[data-bar-actual]', { scaleX: 0, transformOrigin: 'left center', duration: 0.8, stagger: 0.05, ease: 'power2.out' }, 0.3);
    });
  }, { scope: chart, dependencies: [status] });

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
          Films whose theatrical runs have closed: the model&rsquo;s predicted worldwide total next
          to the final gross. When the model called it too high, the difference posts{' '}
          <span className="text-red">in&nbsp;the&nbsp;red</span>.
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
          <div ref={chart} className="border-b border-rule">
            {/* Column heads: each figure is labelled where it sits */}
            <div className={`${ROW} pt-1 pb-2 ${HEAD}`}>
              <span className={COL.poster} />
              <span className={COL.title}>Film</span>
              <span className={`${COL.bar} items-center gap-4`}>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-2" style={{ background: TINT }} /> Predicted
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-2 bg-ink2" /> Actual
                </span>
              </span>
              <span className={`${COL.num} text-right`}>Predicted</span>
              <span className={`${COL.num} text-right`}>Actual</span>
              <span className={`${COL.diff} text-right`}>Difference</span>
            </div>

            {entries.map((entry) => {
              const diff = entry.predicted_revenue - entry.actual_revenue;
              const actualPct = (entry.actual_revenue / maxVal) * 100;
              const predPct = (entry.predicted_revenue / maxVal) * 100;

              return (
                <Link key={entry.tmdb_id} href={`/movie/${entry.tmdb_id}`} data-row className="no-underline text-inherit block group ledger-row border-t border-rule">
                  <div className={`${ROW} py-3.5`}>
                    <div className={`${COL.poster} border border-ink/30`}>
                      <Poster src={entry.poster} alt={entry.title} width={36} height={54} className="object-cover block" />
                    </div>
                    <div className={COL.title}>
                      <p className="text-ink text-[0.85rem] sm:text-[0.9rem] font-semibold truncate leading-tight m-0 group-hover:text-red transition-colors">
                        {entry.title}
                      </p>
                      {entry.genres.length > 0 && (
                        <p className="font-mono text-ink3 text-[0.6rem] tracking-[0.06em] truncate mt-0.5 uppercase">
                          {entry.genres.slice(0, 2).join(' · ')}
                        </p>
                      )}
                    </div>

                    {/* Two bars to one scale: the model's call over the actual gross */}
                    <div className={`${COL.bar} flex-col gap-1`}>
                      <div data-bar-pred className="h-2.5" style={{ width: `${predPct}%`, background: TINT }} />
                      <div data-bar-actual className="h-2.5 bg-ink2" style={{ width: `${actualPct}%` }} />
                    </div>

                    <p className={`${COL.num} ${NUM} text-right text-ink m-0`}>{fmt(entry.predicted_revenue)}</p>
                    <p className={`${COL.num} ${NUM} text-right text-ink m-0`}>{fmt(entry.actual_revenue)}</p>
                    <p className={`${COL.diff} ${NUM} text-right m-0 ${diff > 0 ? 'text-red' : 'text-ink'}`}>
                      {fmtDiff(diff)}
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
