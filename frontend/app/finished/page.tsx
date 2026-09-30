'use client';
import { useRef, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { EASE, gsap, motion, useGSAP } from '@/lib/motion';
import { Poster } from '@/components/Poster';
import { RunningHead } from '@/components/RunningHead';
import { WireDown } from '@/components/WireDown';
import { API_URL } from '@/lib/api';
import { medianMiss, missByWeekend } from '@/lib/ledger';
import { fmtMoney } from '@/lib/money';
import { HEAD, NUM, ROW, TINT } from '@/components/ledgerTable';

const fmt = fmtMoney;
// Signed, actual minus predicted: \u2212 (in the red) when the film fell short
// of the call, + when it beat it. Red only ever marks a negative, site-wide.
const fmtDiff = (n: number) => (n > 0 ? '+' : n < 0 ? '\u2212' : '') + fmt(Math.abs(n));

// Shared by the column heads and every row, so the two can never drift apart.
const COL = {
  poster: 'w-12 shrink-0',
  title: 'min-w-0 flex-1 sm:flex-none sm:w-60',
  bar: 'hidden sm:flex flex-1 min-w-0',
  num: 'hidden sm:block w-28 shrink-0',
  diff: 'w-[6.5rem] sm:w-32 shrink-0',
};

interface FinishedEntry {
  tmdb_id: number;
  title: string;
  poster: string;
  genres: string[];
  predicted_revenue: number;
  actual_revenue: number;
  // The forecast after US weekends 2, 4 and 8, for the weekends its run reached.
  later_calls?: Record<string, number>;
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

  const medianError = useMemo(
    () => medianMiss(entries.map(e => ({ call: e.predicted_revenue, actual: e.actual_revenue }))),
    [entries]
  );

  // The same median for the call made after each later weekend, over the
  // films whose run reached it (shown as the median miss's hint).
  const byWeekend = useMemo(() => missByWeekend(entries), [entries]);
  const byWeekendHint = byWeekend.length > 1
    ? 'After weekend ' + byWeekend
        .map(w => `${w.week}: ${w.median != null ? `${w.median.toFixed(1)}%` : '—'} (${w.films} films)`)
        .join(' · ')
    : undefined;

  // The model's most accurate settled call, as a miss relative to the gross.
  const closest = useMemo(() => {
    let best: { title: string; miss: number } | null = null;
    for (const e of entries) {
      if (e.actual_revenue <= 0) continue;
      const miss = (Math.abs(e.predicted_revenue - e.actual_revenue) / e.actual_revenue) * 100;
      if (!best || miss < best.miss) best = { title: e.title, miss };
    }
    return best;
  }, [entries]);

  const maxVal = useMemo(
    () => Math.max(1, ...entries.map(e => Math.max(e.predicted_revenue, e.actual_revenue))),
    [entries]
  );

  return (
    <main id="main" tabIndex={-1} className="min-h-screen text-ink font-sans">
      <RunningHead active="finished" stamp={false} />

      <div className="px-4 sm:px-8 lg:px-14 pt-9 pb-24 max-w-[74rem] mx-auto w-full">
        {/* Heading, intro and scorecard in one column */}
        <div className="max-w-xl mb-7">
          <h1 className="font-display text-ink text-[2rem] sm:text-[2.6rem] font-bold leading-none m-0 mb-3">
            The Ledger
          </h1>
          <p className="text-ink2 text-[0.88rem] leading-relaxed m-0">
            Films whose theatrical runs have closed: the model&rsquo;s predicted worldwide total next
            to the final gross. When a film fell short of the prediction, the gap posts in&nbsp;the&nbsp;red.
          </p>

          {status === 'ok' && entries.length > 0 && medianError != null && (
            <dl className="flex gap-x-10 sm:gap-x-14 mt-6 mb-0">
              {[
                ['films settled', String(entries.length), undefined],
                ['median miss', `${medianError.toFixed(1)}%`, byWeekendHint],
                ['closest call', closest ? `${closest.miss.toFixed(1)}%` : '\u2014', closest?.title],
              ].map(([label, value, hint]) => (
                <div key={label} className="flex flex-col-reverse" title={hint}>
                  <dt className="text-ink2 text-[0.8rem] mt-1.5">{label}</dt>
                  <dd className="font-mono text-ink text-[1.5rem] tabular-nums leading-none m-0">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="rule-double mb-2" />

        {status === 'loading' && (
          <div className="space-y-px pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="paper-skeleton h-[86px]" />
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
                  <span className="inline-block w-3.5 h-2.5" style={{ background: TINT }} /> Predicted
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3.5 h-2.5 bg-ink2" /> Actual
                </span>
              </span>
              <span className={`${COL.num} text-right`}>Predicted</span>
              <span className={`${COL.num} text-right`}>Actual</span>
              <span className={`${COL.diff} text-right`}>Difference</span>
            </div>

            {entries.map((entry) => {
              const diff = entry.actual_revenue - entry.predicted_revenue;
              const actualPct = (entry.actual_revenue / maxVal) * 100;
              const predPct = (entry.predicted_revenue / maxVal) * 100;

              return (
                <Link key={entry.tmdb_id} href={`/movie/${entry.tmdb_id}`} data-row className="no-underline text-inherit block group ledger-row border-t border-rule">
                  <div className={`${ROW} py-4`}>
                    <div className={`${COL.poster} border border-ink/30`}>
                      <Poster src={entry.poster} alt={entry.title} width={46} height={69} className="object-cover block" />
                    </div>
                    <div className={COL.title}>
                      <p className="text-ink text-[0.92rem] sm:text-[1.02rem] font-semibold line-clamp-2 sm:line-clamp-1 leading-tight m-0 group-hover:text-red transition-colors">
                        {entry.title}
                      </p>
                      {/* Phones have no columns for the two grosses: each is named here */}
                      <p className="sm:hidden m-0 mt-1.5 text-ink2 text-[0.78rem] leading-[1.5]">
                        Predicted <span className="font-mono tabular-nums text-ink">{fmt(entry.predicted_revenue)}</span>
                        <br />
                        Actual <span className="font-mono tabular-nums text-ink">{fmt(entry.actual_revenue)}</span>
                      </p>
                      {entry.genres.length > 0 && (
                        <p className="hidden sm:block font-sans text-ink2 text-[0.75rem] truncate mt-1">
                          {entry.genres.slice(0, 2).join(' · ')}
                        </p>
                      )}
                    </div>

                    {/* Two bars to one scale: the model's call over the actual gross */}
                    <div className={`${COL.bar} flex-col gap-1`}>
                      <div data-bar-pred className="h-3" style={{ width: `${predPct}%`, background: TINT }} />
                      <div data-bar-actual className="h-3 bg-ink2" style={{ width: `${actualPct}%` }} />
                    </div>

                    <p className={`${COL.num} ${NUM} text-right text-ink m-0`}>{fmt(entry.predicted_revenue)}</p>
                    <p className={`${COL.num} ${NUM} text-right text-ink m-0`}>{fmt(entry.actual_revenue)}</p>
                    <p className={`${COL.diff} ${NUM} text-right m-0 ${diff < 0 ? 'text-red' : 'text-ink'}`}>
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
