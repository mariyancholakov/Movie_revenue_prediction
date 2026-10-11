import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RunningHead } from '@/components/RunningHead';
import { HEAD, NUM, ROW } from '@/components/ledgerTable';
import { ADMIN_KEY, fetchMonitor, isAdmin, type Monitor, type Summary } from '@/lib/admin';
import { fmtMoney } from '@/lib/money';
import { signIn, signOut } from './actions';

// Owner only: out of search results, and never cached.
export const metadata: Metadata = {
  title: 'Monitor',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)}%`);
const days = (n: number | null) => (n == null ? '—' : n < 1 ? 'today' : `${n.toFixed(0)} d ago`);
const signed = (n: number | null) =>
  n == null ? '—' : `${Math.abs(n).toFixed(1)}% ${n > 0 ? 'high' : n < 0 ? 'low' : ''}`.trim();

const HEADLINE = {
  ok: 'All clear',
  watch: 'Worth a look',
  alert: 'Needs attention',
} as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  if (!ADMIN_KEY) notFound();
  if (!(await isAdmin())) return <SignIn denied={(await searchParams).denied === '1'} />;

  const report = await fetchMonitor();
  return (
    <main id="main" tabIndex={-1} className="min-h-screen text-ink font-sans">
      <RunningHead stamp={false} />
      <div className="px-4 sm:px-8 lg:px-14 pt-9 pb-24 max-w-[74rem] mx-auto w-full">
        <h1 className="font-display text-ink text-[2rem] sm:text-[2.6rem] font-bold leading-none m-0 mb-3">
          Monitor
        </h1>
        {report ? <Report r={report} /> : (
          <p className="text-red-ink text-[0.95rem] m-0">
            The API did not answer, or refused the key. Check that ADMIN_API_KEY is the same on both hosts.
          </p>
        )}
        <form action={signOut} className="mt-14">
          <button className="ledger-btn-quiet font-sans text-[0.8rem] font-semibold px-5 py-2.5 cursor-pointer">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}

function SignIn({ denied }: { denied: boolean }) {
  return (
    <main id="main" tabIndex={-1} className="min-h-screen text-ink font-sans">
      <RunningHead stamp={false} />
      <div className="px-4 sm:px-8 lg:px-14 pt-9 pb-24 max-w-[74rem] mx-auto w-full">
        <h1 className="font-display text-ink text-[2rem] sm:text-[2.6rem] font-bold leading-none m-0 mb-6">
          Monitor
        </h1>
        <form action={signIn} className="flex flex-col items-start gap-3 max-w-sm">
          <label htmlFor="key" className="text-ink2 text-[0.88rem]">Key</label>
          <input
            id="key"
            name="key"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            className="w-full bg-transparent border border-ink px-3 py-2.5 font-mono text-[1rem] text-ink"
          />
          {denied && <p role="alert" className="text-red-ink text-[0.88rem] m-0">That key was not accepted.</p>}
          <button className="ledger-btn font-sans text-[0.8rem] font-semibold px-6 py-3 cursor-pointer">
            Open
          </button>
        </form>
      </div>
    </main>
  );
}

function Report({ r }: { r: Monitor }) {
  const f = r.freshness;
  const rows: [string, Summary][] = [
    ['Opening call, all settled runs', r.accuracy.opening],
    ['Opening call, last 10', r.accuracy.rolling],
    ...Object.entries(r.accuracy.later).map(([k, s]): [string, Summary] => [`After weekend ${k}`, s]),
  ];
  const facts: [string, string][] = [
    ['Films being tracked', String(f.tracked)],
    ['Newest scrape', days(f.newest_scrape_days)],
    ['Oldest scrape', days(f.oldest_scrape_days)],
    ['Past the 8-day refresh', String(f.stale)],
    ['Last run settled', days(f.last_settled_days)],
    ['Runs settled in all', String(f.settled)],
    ['Push subscriptions', String(f.push_subscriptions)],
  ];
  const m = r.model;
  return (
    <>
      <p className={`text-[1.05rem] font-semibold m-0 mb-2 ${r.status === 'alert' ? 'text-red-ink' : 'text-ink'}`}>
        {HEADLINE[r.status]}
      </p>
      <ul className="m-0 mb-10 p-0 list-none max-w-2xl space-y-1.5">
        {r.flags.map((x, i) => (
          <li key={i} className={`text-[0.9rem] leading-relaxed ${x.level === 'alert' ? 'text-red-ink' : 'text-ink2'}`}>
            {x.text}
          </li>
        ))}
      </ul>

      <h2 className="font-display text-[1.4rem] font-bold m-0 mb-3">Live accuracy against the exam</h2>
      <div className="rule-double mb-1" />
      <div className={`${ROW} py-2`}>
        <span className={`${HEAD} flex-1`}>Call</span>
        <span className={`${HEAD} w-14 text-right`}>Runs</span>
        <span className={`${HEAD} w-16 sm:w-20 text-right`}>Live miss</span>
        <span className={`${HEAD} w-16 sm:w-20 text-right`}>Exam miss</span>
        <span className={`${HEAD} w-20 sm:w-28 text-right`}>Called</span>
      </div>
      {rows.map(([label, s]) => (
        <div key={label} className={`${ROW} py-2.5 border-t border-rule`}>
          <span className="flex-1 text-[0.9rem]">{label}</span>
          <span className={`${NUM} w-14 text-right`}>{s.n}</span>
          <span className={`${NUM} w-16 sm:w-20 text-right ${s.ratio != null && s.n >= 8 && s.ratio >= 1.25 ? 'text-red-ink' : ''}`}>
            {pct(s.median_miss)}
          </span>
          <span className={`${NUM} w-16 sm:w-20 text-right text-ink2`}>{pct(s.expected)}</span>
          <span className={`${NUM} w-20 sm:w-28 text-right`}>{signed(s.bias)}</span>
        </div>
      ))}

      <h2 className="font-display text-[1.4rem] font-bold m-0 mt-12 mb-3">Data jobs</h2>
      <div className="rule-double mb-1" />
      {facts.map(([label, value]) => (
        <div key={label} className={`${ROW} py-2.5 border-t border-rule first:border-t-0`}>
          <span className="flex-1 text-[0.9rem]">{label}</span>
          <span className={`${NUM} text-right`}>{value}</span>
        </div>
      ))}

      <h2 className="font-display text-[1.4rem] font-bold m-0 mt-12 mb-3">Last settled runs</h2>
      <div className="rule-double mb-1" />
      <div className={`${ROW} py-2`}>
        <span className={`${HEAD} flex-1`}>Film</span>
        <span className={`${HEAD} w-16 sm:w-24 text-right`}>Called</span>
        <span className={`${HEAD} w-16 sm:w-24 text-right`}>Final</span>
        <span className={`${HEAD} w-14 sm:w-20 text-right`}>Miss</span>
      </div>
      {r.recent_settled.map(x => (
        <div key={x.tmdb_id} className={`${ROW} py-2.5 border-t border-rule`}>
          <span className="flex-1 text-[0.9rem] min-w-0 truncate">{x.title}</span>
          <span className={`${NUM} w-16 sm:w-24 text-right`}>{fmtMoney(x.predicted)}</span>
          <span className={`${NUM} w-16 sm:w-24 text-right`}>{fmtMoney(x.actual)}</span>
          <span className={`${NUM} w-14 sm:w-20 text-right ${x.miss >= 30 ? 'text-red-ink' : ''}`}>{pct(x.miss)}</span>
        </div>
      ))}

      <h2 className="font-display text-[1.4rem] font-bold m-0 mt-12 mb-3">The promoted model</h2>
      <div className="rule-double mb-1" />
      <div className={`${ROW} py-2.5`}>
        <span className="flex-1 text-[0.9rem]">{m.file}</span>
        <span className={`${NUM} text-right`}>{m.age_days == null ? '—' : `${m.age_days} d old`}</span>
      </div>
      <div className={`${ROW} py-2.5 border-t border-rule`}>
        <span className="flex-1 text-[0.9rem]">Trained on</span>
        <span className={`${NUM} text-right`}>
          {m.seed_rows ?? '—'} + {m.captured_rows ?? '—'} films
        </span>
      </div>
      <div className={`${ROW} py-2.5 border-t border-rule`}>
        <span className="flex-1 text-[0.9rem]">Exam holdout</span>
        <span className={`${NUM} text-right`}>{m.holdout_n ?? '—'} films</span>
      </div>
      <div className={`${ROW} py-2 mt-4`}>
        <span className={`${HEAD} flex-1`}>Exam, by US weekend</span>
        <span className={`${HEAD} w-20 text-right`}>Median miss</span>
        <span className={`${HEAD} w-20 sm:w-24 text-right`}>Avg $ off</span>
      </div>
      {Object.entries(m.exam).map(([k, v]) => (
        <div key={k} className={`${ROW} py-2 border-t border-rule`}>
          <span className="flex-1 text-[0.9rem]">{k === '1' ? 'Opening weekend' : `After weekend ${k}`}</span>
          <span className={`${NUM} w-20 text-right`}>{pct(v.median_miss)}</span>
          <span className={`${NUM} w-20 sm:w-24 text-right`}>{fmtMoney(v.mae)}</span>
        </div>
      ))}
    </>
  );
}
