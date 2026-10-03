'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { EASE, gsap, motion, useGSAP } from '@/lib/motion';
import { RunningHead } from '@/components/RunningHead';
import { DecayCurve } from '@/components/DecayCurve';
import { PosterMosaic } from '@/components/PosterMosaic';
import { WireDown } from '@/components/WireDown';
import { Typed, typeOut } from '@/components/Typed';
import type { DecayCurveData } from '@/components/types';
import { API_URL } from '@/lib/api';
import { medianMiss } from '@/lib/ledger';
import { fmtMoney } from '@/lib/money';
import { HEAD, NUM } from '@/components/ledgerTable';

const REPO = 'https://github.com/mariyancholakov/Movie_revenue_prediction';

// The groups /api/explain splits a film's multiplier into (model_lib.RUN_EXPLAIN_GROUPS).
type Group = 'opening' | 'genre' | 'timing' | 'franchise' | 'origin' | 'era'
  | 'rating' | 'talent' | 'abroad' | 'run';

interface Explain {
  tmdb_id: number;
  title: string;
  opening_weekend: number;
  predicted_revenue: number;
  multiplier: number;
  base_multiplier: number;
  factors: Partial<Record<Group, number>>;
  features: Record<string, number | boolean | string | null>;
  weeks_reported?: number;
  decay_curve: DecayCurveData | null;
}

interface Film {
  tmdb_id: number; title: string; poster: string; predicted_revenue: number;
  budget: number | null; decay_rate: number | null;
}

const STEPS = [
  { id: 'opening', label: 'The opening' },
  { id: 'file', label: 'The file' },
  { id: 'multiplier', label: 'The multiplier' },
  { id: 'total', label: 'The total' },
  { id: 'curve', label: 'The curve' },
  { id: 'ledger', label: 'The Ledger' },
  { id: 'retrain', label: 'Retraining' },
  { id: 'limits', label: 'The limits' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const GENRES: [string, string][] = [
  ['action', 'Action'], ['adventure', 'Adventure'], ['animation', 'Animation'], ['comedy', 'Comedy'],
  ['crime', 'Crime'], ['documentary', 'Documentary'], ['drama', 'Drama'], ['family', 'Family'],
  ['fantasy', 'Fantasy'], ['horror', 'Horror'], ['mystery', 'Mystery'], ['romance', 'Romance'],
  ['science_fiction', 'Science Fiction'], ['thriller', 'Thriller'],
];

const PROSE = 'text-ink2 text-[0.95rem] sm:text-[1.02rem] leading-[1.7] m-0 max-w-[40rem]';
const x2 = (n: number) => n.toFixed(2);

/** The file, as the model reads it: one plain line per group of features. */
function describe(f: Explain['features'], weeksReported = 0) {
  const n = (k: string) => Number(f[k] ?? 0);
  const stage = Math.min(Math.max(weeksReported, 1), 8);
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const genres = GENRES.filter(([k]) => n(`genre_${k}`)).map(([, name]) => name);
  const month = n('release_month');
  const season = ['Winter', 'Spring', 'Summer', 'Fall'].find(s => f[`release_season_${s}`]) ?? '';
  const prior = n('prior_parts');
  return {
    opening: n('open_theaters')
      ? `${fmtMoney(n('opening_weekend'))} · ${n('open_theaters').toLocaleString('en-US')} theaters`
      : fmtMoney(n('opening_weekend')),
    genre: genres.length ? genres.join(' · ') : 'None listed',
    timing: month ? `${MONTHS[month - 1]}${season ? ` · ${season.toLowerCase()}` : ''}` : 'Unknown',
    franchise: !n('in_collection') ? 'Original'
      : prior ? `Sequel · ${prior} earlier film${prior === 1 ? '' : 's'}` : 'First in a series',
    origin: [
      n('is_major_studio') ? 'Major studio' : 'Independent',
      n('is_us_production') ? 'US-made' : 'Made abroad',
      n('is_english') ? 'English' : 'Not in English',
      ...(f.distributor ? [String(f.distributor)] : []),
    ].join(' · '),
    era: n('release_year') ? String(n('release_year')) : 'Unknown',
    rating: f.mpaa ? String(f.mpaa) : 'Not rated',
    talent: `${plural(n('dir_prior_n'), 'earlier film')} by the director · ${n('cast_prior_n')} by the leads`,
    abroad: n(`intl_markets_w${stage}`)
      ? `${fmtMoney(n(`intl_open_w${stage}`))} from ${plural(n(`intl_markets_w${stage}`), 'market')}`
      : 'No markets reported yet',
    run: weeksReported > 1 ? `${weeksReported} US weekends so far` : 'Opening weekend only',
  } satisfies Record<Group, string>;
}

const LABELS: Record<Group, string> = {
  opening: 'Size of the opening',
  genre: 'Genre',
  timing: 'Release month',
  franchise: 'Franchise',
  origin: 'Studio, country, language',
  era: 'Release year',
  rating: 'Rating',
  talent: 'Director and leads',
  abroad: 'Openings abroad',
  run: 'The run so far',
};

// The step index glides to its step instead of jumping (a plain jump under
// reduced motion), and keeps the address pointing at the step.
function goToStep(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', `#${id}`);
}

export default function HowItWorksPage() {
  const [films, setFilms] = useState<Film[]>([]);
  const [filmId, setFilmId] = useState<number | null>(null);
  const [data, setData] = useState<Explain | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  // undefined while the Ledger loads; null when it has nothing to show.
  const [record, setRecord] = useState<{ runs: number; median: number } | null | undefined>(undefined);
  const [active, setActive] = useState(STEPS[0].id);
  const root = useRef<HTMLDivElement>(null);

  // The films open to a worked example are the priced ones (Rankings). Start
  // on the biggest one with a budget and a decay curve, so every step has
  // something to show.
  useEffect(() => {
    fetch(`${API_URL}/api/leaderboard`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((list: Film[]) => {
        setFilms(list);
        const first = list.find(f => f.budget && f.decay_rate != null) ?? list[0];
        if (first) setFilmId(first.tmdb_id);
        else setStatus('error');
      })
      .catch(() => setStatus('error'));

    fetch(`${API_URL}/api/finished`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((rows: { predicted_revenue: number; actual_revenue: number }[]) => {
        const calls = rows.map(r => ({ call: r.predicted_revenue, actual: r.actual_revenue }));
        const median = medianMiss(calls);
        setRecord(median == null ? null : { runs: calls.filter(c => c.actual > 0).length, median });
      })
      .catch(() => setRecord(null));
  }, []);

  useEffect(() => {
    if (filmId == null) return;
    let live = true;
    fetch(`${API_URL}/api/explain/${filmId}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d: Explain) => { if (live) { setData(d); setStatus('ok'); } })
      .catch(() => { if (live) setStatus('error'); });
    return () => { live = false; };
  }, [filmId]);

  // The step index follows the reader down the page: the current step is the
  // last one whose top has passed 40% of the way down the screen.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.4;
      const passed = STEPS.filter(s => (document.getElementById(s.id)?.getBoundingClientRect().top ?? Infinity) <= line);
      setActive((passed.at(-1) ?? STEPS[0]).id);
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
  }, []);

  // Each exhibit is worked as it scrolls into view: lines post, bars run
  // out from the rule, figures are typed. Again from the top on a new film.
  useGSAP(() => {
    if (!data) return;
    motion(() => {
      gsap.utils.toArray<HTMLElement>('[data-exhibit]').forEach(ex => {
        const tl = gsap.timeline({
          defaults: { ease: EASE },
          scrollTrigger: { trigger: ex, start: 'top 80%', once: true },
        });
        const rows = ex.querySelectorAll('[data-row]');
        if (rows.length) tl.from(rows, { opacity: 0, y: 6, duration: 0.35, stagger: 0.07 });
        const bars = ex.querySelectorAll<HTMLElement>('[data-bar]');
        if (bars.length) {
          tl.from(bars, {
            scaleX: 0, duration: 0.7, stagger: 0.07, ease: 'power2.out',
            transformOrigin: (_: number, el: HTMLElement) => `${el.dataset.bar} center`,
          }, 0.15);
        }
        if (ex.querySelector('svg')) tl.from(ex.querySelector('svg'), { opacity: 0, y: 8, duration: 0.6 }, 0);
        ex.querySelectorAll('[data-figure]').forEach(f => typeOut(tl, f, { pace: 0.6 }));
      });
    });
  }, { scope: root, dependencies: [data], revertOnUpdate: true });

  const file = data ? describe(data.features, data.weeks_reported) : null;
  const factors = data
    ? (Object.entries(data.factors) as [Group, number][])
        .sort((a, b) => Math.abs(Math.log(b[1])) - Math.abs(Math.log(a[1])))
    : [];
  // Bars are on a log scale, so ×2 and ×0.5 reach equally far from the rule.
  const reach = Math.max(Math.log(1.5), ...factors.map(([, f]) => Math.abs(Math.log(f))));
  const up = factors.filter(([, f]) => f > 1)[0];
  const down = factors.filter(([, f]) => f < 1)[0];
  const curve = data?.decay_curve;
  const lam = curve?.decay_rate;

  return (
    <main id="main" tabIndex={-1} className="min-h-screen text-ink font-sans">
      <RunningHead active="how" stamp={false} />

      <div ref={root} className="px-4 sm:px-8 lg:px-14 pt-9 pb-24 max-w-[74rem] mx-auto w-full">
        {/* This week's posters sit faintly behind the page, tiled by gross,
            pinned to the screen so the steps scroll over them */}
        <PosterMosaic films={films} />
        <div>
          <h1 className="font-display text-ink text-[2.2rem] sm:text-[3.2rem] font-bold leading-[1.02] m-0 mb-4 max-w-3xl">
            How a number gets made
          </h1>
          <p className={`${PROSE} pb-8`}>
            Here is the whole process, step by step, worked through with the real
            figures for a film in theaters now.
            <span className="max-sm:hidden">
              {' '}The forecasts are free to use, too: see the{' '}
              <Link href="/api-docs" className="text-ink underline decoration-ink/40 underline-offset-2 hover:text-red transition-colors">
                public API
              </Link>.
            </span>
          </p>
        </div>

        {/* The worked example: every figure on the page below is this film's. */}
        <div className="rule-double" />
        {/* One ruled line: the film and its link sit on the same bottom rule */}
        <div className="flex flex-nowrap items-end gap-x-4 sm:gap-x-6 py-4">
          {films.length > 0 ? (
            // Sized to the chosen title, not the longest one, with its own chevron beside it
            <span className="relative inline-flex min-w-0 max-w-full">
              <select
                id="film"
                aria-label="Example film"
                value={filmId ?? ''}
                onChange={e => setFilmId(Number(e.target.value))}
                className="search-field appearance-none [field-sizing:content] max-w-[min(26rem,100%)] truncate bg-transparent font-mono text-ink text-base sm:text-[1.05rem] leading-6 border-0 border-b border-ink/40 rounded-none pt-2.5 pb-3 pl-1 pr-6 cursor-pointer"
              >
                {films.map(f => <option key={f.tmdb_id} value={f.tmdb_id}>{f.title}</option>)}
              </select>
              <svg aria-hidden viewBox="0 0 10 6" className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-1.5 text-ink2">
                <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </span>
          ) : status === 'loading' ? (
            <span className="paper-skeleton inline-block h-6 w-48" />
          ) : null}
          {data && (
            <Link href={`/movie/${data.tmdb_id}`} className="group inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-ink text-[0.95rem] leading-6 no-underline border-b border-ink/40 pt-3 pb-3 transition-colors hover:border-red hover:text-red">
              <span className="sm:hidden">Film page</span>
              <span className="max-sm:hidden">Open film page</span>
              <span aria-hidden className="text-ink2 transition-transform group-hover:translate-x-1">→</span>
            </Link>
          )}
        </div>
        {status === 'error' && <WireDown className="mt-6" />}

        <div className="lg:grid lg:grid-cols-[11rem_1fr] lg:gap-14 mt-10">
          {/* Step index: the flow at a glance, and where the reader is in it */}
          <nav aria-label="Steps" className="hidden lg:block">
            <ol className="sticky top-8 list-none m-0 p-0">
              {STEPS.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    onClick={e => goToStep(e, s.id)}
                    className={`flex items-baseline gap-3 py-2.5 no-underline text-[0.92rem] transition-colors ${active === s.id ? 'text-ink font-semibold' : 'text-ink3 hover:text-ink'}`}
                  >
                    <span className="font-mono text-[0.78rem] w-4 text-right">{i < 7 ? i + 1 : '·'}</span>
                    <span className={`border-b-2 ${active === s.id ? 'border-red' : 'border-transparent'}`}>{s.label}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0 flex flex-col gap-20">
            {/* 1 ─ The opening */}
            <Step n={1} id="opening" title="It starts with the opening weekend">
              <p className={PROSE}>
                A film can&rsquo;t be priced before it opens.
                <span className="max-sm:hidden">
                  {' '}On the Monday after its first Friday-to-Sunday in US theaters, Box Office
                  Mojo reports what it took.
                </span>
                {' '}That one figure sets the scale of the whole run: a film that opens to
                $100M isn&rsquo;t going to finish at $20M.
              </p>
              <Exhibit ready={!!data}>
                {data && (
                  <div className="border-l-2 border-ink/25 pl-5">
                    <p data-figure className="font-mono tabular-nums text-ink text-[1.8rem] sm:text-[2.2rem] leading-none m-0"><Typed text={fmtMoney(data.opening_weekend)} /></p>
                    <p className="text-ink2 text-[0.88rem] m-0 mt-2">{data.title}&rsquo;s US opening weekend, as Box Office Mojo reported it</p>
                  </div>
                )}
              </Exhibit>
            </Step>

            {/* 2 ─ The file */}
            <Step n={2} id="file" title="Then the model reads the file">
              <p className={PROSE}>
                TMDB supplies what kind of film it is and who made it; Box Office Mojo adds
                how many theaters it opened in, its rating, its distributor and what it
                opened to in other countries.
                <span className="max-sm:hidden">
                  {' '}The director and leads are read by their record: what their earlier
                  films made.
                </span>
                {' '}There are no reviews and no trailer views, only facts that are on record
                the week a film opens.
              </p>
              <Exhibit ready={!!file}>
                {file && (
                  <dl className="m-0 border-t border-ink">
                    {(['genre', 'timing', 'franchise', 'origin', 'rating', 'talent', 'abroad', 'era'] as Group[]).map(g => (
                      <div key={g} data-row className="grid grid-cols-[8.5rem_1fr] sm:grid-cols-[13rem_1fr] gap-4 py-2.5 border-b border-rule">
                        <dt className={`${HEAD} pt-[0.2rem]`}>{LABELS[g]}</dt>
                        <dd className="m-0 font-mono text-ink text-[0.9rem]">{file[g]}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Exhibit>
              <p className={`${PROSE} text-[0.85rem] sm:text-[0.88rem] max-sm:hidden`}>
                Left out on purpose: TMDB&rsquo;s popularity score. In the training data it
                was measured years after each release, while a new film is scored in its
                opening week, so the model would read every new film as unusually hot. Budget
                and runtime are left out too: TMDB has no budget for many new films, and once
                the opening weekend is in, the model is more accurate without either.
              </p>
            </Step>

            {/* 3 ─ The multiplier */}
            <Step n={3} id="multiplier" title="It predicts a multiplier, not dollars">
              <p className={PROSE}>
                This is the core idea. The model doesn&rsquo;t guess the total directly. It
                predicts the <em>multiplier</em>: the worldwide total divided by the US opening
                weekend. The opening already says how big a film is. The rest of the file
                mostly says how long it will hold, and how far it will travel abroad.
              </p>
              <p className={PROSE}>
                <span className="max-sm:hidden">
                  It answers those two questions separately, with two gradient-boosted tree
                  ensembles (XGBoost) trained on 5,389 past releases: how many times its
                  opening the film will make in the US, and how much bigger the world makes
                  that. Together they start from the multiplier of a typical film and let
                  each part of the file push it up or down.
                </span>
                {up && down && data && (
                  <><span className="max-sm:hidden">{' '}</span>For {data.title}, the biggest push came from {LABELS[up[0]].toLowerCase()} (×{x2(up[1])}),
                  and the biggest pull from {LABELS[down[0]].toLowerCase()} (×{x2(down[1])}).</>
                )}
              </p>
              <Exhibit ready={!!data}>
                {data && file && (
                  <div className="border-t border-ink">
                    <div className={`grid grid-cols-[1fr_auto] sm:grid-cols-[14rem_1fr_5.5rem] gap-x-5 items-center pt-2 pb-2 ${HEAD}`}>
                      <span>Part of the file</span>
                      <span className="hidden sm:flex justify-between">
                        <span>← Lowers it</span><span>Raises it →</span>
                      </span>
                      <span className="text-right">Effect</span>
                    </div>
                    <p className={`sm:hidden flex gap-4 m-0 pb-2.5 ${HEAD}`}>
                      <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-2 w-3 bg-ink2" />Raises it</span>
                      <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-2 w-3 bg-red" />Lowers it</span>
                    </p>
                    <TapeRow label="Starting point" detail="The typical film" figure={`${x2(data.base_multiplier)}×`} />
                    {factors.map(([g, f]) => {
                      // Judged on the figure as printed, so a 0.997 shown as 1.00 isn't marked as a loss
                      const lowers = Number(x2(f)) < 1;
                      return (
                      <TapeRow key={g} label={LABELS[g]} detail={file[g]} figure={`× ${x2(f)}`} lowers={lowers}>
                        {/* A phone has no room for a bar each way round the rule: the bar runs one way
                            from the left, as long as the effect is big, black to raise and red to lower */}
                        <div className="sm:hidden relative h-2 w-full bg-rule/60">
                          <div
                            data-bar="left"
                            className={`absolute inset-y-0 left-0 ${lowers ? 'bg-red' : 'bg-ink2'}`}
                            style={{ width: `${(Math.abs(Math.log(f)) / reach) * 100}%` }}
                          />
                        </div>
                        <div className="max-sm:hidden relative h-4 w-full">
                          <div className="absolute inset-y-[-4px] left-1/2 w-px bg-ink/50" />
                          <div
                            data-bar={f >= 1 ? 'left' : 'right'}
                            className="absolute inset-y-0 bg-ink2"
                            style={{
                              width: `${(Math.abs(Math.log(f)) / reach) * 50}%`,
                              ...(f >= 1 ? { left: '50%' } : { right: '50%' }),
                            }}
                          />
                        </div>
                      </TapeRow>
                      );
                    })}
                    <div className="rule-double" />
                    <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[14rem_1fr_5.5rem] gap-x-5 items-baseline py-3">
                      <span className="text-ink font-semibold text-[0.92rem]">Multiplier</span>
                      <span className="hidden sm:block" />
                      <span data-figure className={`${NUM} text-ink text-right`}><Typed text={`= ${x2(data.multiplier)}×`} /></span>
                    </div>
                  </div>
                )}
              </Exhibit>
              <p className={`${PROSE} text-[0.85rem] sm:text-[0.88rem] max-sm:hidden`}>
                The opening shows up twice: it sets the scale, and it also moves the
                multiplier, because huge openers tend to burn out fast while small ones have
                room to grow. The effects are the model&rsquo;s own accounting (SHAP values),
                and they multiply out to its prediction exactly.
              </p>
            </Step>

            {/* 4 ─ The total */}
            <Step n={4} id="total" title="Multiply it back out">
              <p className={PROSE}>
                Opening weekend times multiplier is the predicted total. It&rsquo;s a
                worldwide figure, even though the opening is US-only: from past films, and
                from what this one opened to abroad, the model has learned how a US opening
                translates into a global run.
                <span className="max-sm:hidden">
                  {' '}Beside it the film page prints the prediction&rsquo;s range,
                  read off the model&rsquo;s own misses on films it never saw: half of films
                  like it finished inside, a quarter above and a quarter below. It is wide
                  for a small opening and narrows as the weekends come in.
                </span>
              </p>
              <Exhibit ready={!!data}>
                {data && (
                  <div className="flex flex-nowrap items-end gap-x-2 sm:gap-x-6">
                    <Figure label="US opening weekend" short="Opening" value={fmtMoney(data.opening_weekend)} />
                    <span className={`${NUM} text-ink3 pb-[0.1rem] shrink-0`}>×</span>
                    <Figure label="Multiplier" value={`${x2(data.multiplier)}×`} />
                    <span className={`${NUM} text-ink3 pb-[0.1rem] shrink-0`}>=</span>
                    <Figure label="Predicted worldwide total" short="Predicted total" value={fmtMoney(data.predicted_revenue)} />
                  </div>
                )}
              </Exhibit>
            </Step>

            {/* 5 ─ The curve */}
            <Step n={5} id="curve" title="The weekends trace a curve">
              <p className={PROSE}>
                As the weekends come in, they&rsquo;re fitted to an exponential decay,
                <span className="font-mono text-ink whitespace-nowrap"> G(t) = G₀·e<sup>−λt</sup></span>.
                The decay rate λ says how fast audiences fall away.
                {data && lam != null && lam > 0 && (
                  <> {data.title}&rsquo;s λ of {lam.toFixed(2)} means each weekend keeps
                  about {Math.round(Math.exp(-lam) * 100)}% of the one before, so its
                  weekend gross halves every {(Math.LN2 / lam).toFixed(1)} weeks.</>
                )}
                <span className="max-sm:hidden">
                  {' '}The curve itself is a read-out. The weekends aren&rsquo;t: after each
                  one, the forecast is made again with the run so far, the gross to date,
                  the last weekend and how hard it dropped.
                </span>
                {' '}On films the model never saw, the median miss falls from 27% at opening
                to 16% after four weekends and 13% after eight.
              </p>
              <Exhibit ready={!!data}>
                {data && (curve && curve.weeks.length > 1 ? (
                  // Held to the prose's measure, so the chart lines up with the text above
                  <div className="max-w-[40rem]"><DecayCurve data={curve} /></div>
                ) : (
                  <p className="text-ink2 text-[0.88rem] m-0">
                    Not enough weekends are in yet to fit a curve for {data.title}.
                  </p>
                ))}
              </Exhibit>
            </Step>

            {/* 6 ─ The Ledger */}
            <Step n={6} id="ledger" title="Every call is settled in public">
              <p className={PROSE}>
                A prediction is a claim, and claims get checked. Once a film has left
                theaters and is at least 12 weeks past release, the run is settled on{' '}
                <Link href="/finished" className="text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-ink">The Ledger</Link>:
                predicted against actual, misses included. The call it&rsquo;s held to is
                the one made on opening weekend
                <span className="max-sm:hidden">
                  , not the late forecast, which by then has most of the run in hand
                </span>
                .
                <span className="max-sm:hidden">
                  {' '}The actual is the same worldwide figure the model learns from: Box
                  Office Mojo&rsquo;s, or TMDB&rsquo;s where Mojo has no foreign grosses.
                </span>
              </p>
              <Exhibit ready={record !== undefined}>
                {record && (
                  <div className="flex flex-wrap items-end gap-x-10 sm:gap-x-14 gap-y-4">
                    <Figure label="Runs settled so far" value={String(record.runs)} />
                    <Figure label="Median miss" value={`${record.median.toFixed(1)}%`} />
                  </div>
                )}
              </Exhibit>
            </Step>

            {/* 7 ─ Retraining */}
            <Step n={7} id="retrain" title="Settled runs teach the next model">
              <p className={PROSE}>
                Every settled run becomes one more training example. A new candidate model
                is then put through an honest exam: it trains only on films released before
                2017 and is scored on the 1,107 released since
                <span className="max-sm:hidden">
                  , the same job it does live, pricing films newer than anything it has seen
                </span>
                . It replaces the current model
                only if it wins, and a person makes that call.
              </p>
              <Exhibit ready>
                <div className="border-t border-ink">
                  <div className={`grid grid-cols-[1fr_5rem_5rem] sm:grid-cols-[1fr_8rem_8rem] gap-x-4 py-2 ${HEAD}`}>
                    <span>Approach</span>
                    <span className="text-right">Avg. miss</span>
                    <span className="text-right">Median miss</span>
                  </div>
                  {[
                    ['Earlier model: one multiplier, TMDB data', '$53M', '38.4%'],
                    ['Live model: US run, then the world, Mojo data', '$42M', '26.3%'],
                  ].map(([name, mae, med]) => (
                    <div key={name} data-row className="grid grid-cols-[1fr_5rem_5rem] sm:grid-cols-[1fr_8rem_8rem] gap-x-4 items-baseline py-3 border-t border-rule">
                      <span className="text-ink text-[0.9rem]">{name}</span>
                      <span className={`${NUM} text-ink text-right`}>{mae}</span>
                      <span className={`${NUM} text-ink text-right`}>{med}</span>
                    </div>
                  ))}
                </div>
              </Exhibit>
              <Cycle />
            </Step>

            {/* The limits */}
            <Step id="limits" title="What the model can’t know">
              <ul className="list-none m-0 p-0 flex flex-col gap-5 max-w-[44rem]">
                {[
                  ['Whether the film is any good.', 'Nothing in the file measures word of mouth. A crowd-pleaser and a dud with the same opening and profile get the same number.'],
                  ['Anything before opening day.', 'No US opening weekend, no prediction. Films that skip US theaters aren’t priced at all, and a film that opens abroad first waits for its US opening.'],
                  ['Small releases, precisely.', 'A limited opening can grow many times over or vanish, so its multiplier is a wide guess. The film page flags these as rough.'],
                  ['How a film holds abroad.', 'The model sees what a film opened to in other countries, but not how it held there afterwards. A film that keeps growing overseas will be undercalled.'],
                  ['Better data than TMDB has.', 'Budgets are often missing or estimates, and final grosses keep being revised after a run ends. The Ledger follows the revisions for a year.'],
                ].map(([head, body], i, all) => (
                  <li key={head} className={i === all.length - 1 ? 'max-sm:hidden' : undefined}>
                    <p className="text-ink font-semibold text-[0.95rem] m-0 mb-1">{head}</p>
                    <p className="text-ink2 text-[0.9rem] leading-relaxed m-0">{body}</p>
                  </li>
                ))}
              </ul>
            </Step>

            {/* Open source */}
            <section className="max-w-[44rem]">
              <h2 className="font-display text-ink text-[1.6rem] sm:text-[2rem] font-bold leading-tight m-0 mb-3">
                Check the working
              </h2>
              <p className={`${PROSE} mb-5`}>
                MOVIEGROSS is open source. The model, the scrapers, the retraining exam and
                this page are all on GitHub.
                <span className="max-sm:hidden">
                  {' '}The model lives in{' '}
                  <code className="font-mono text-ink text-[0.9em]">model_lib.py</code> and the exam in{' '}
                  <code className="font-mono text-ink text-[0.9em]">retrain.py</code>. The forecasts
                  are free to use too.
                </span>
              </p>
              <div className="flex flex-nowrap gap-3">
                <a href={REPO} target="_blank" rel="noopener noreferrer" className="ledger-btn inline-block whitespace-nowrap no-underline font-mono text-[0.75rem] tracking-[0.14em] indent-[0.14em] uppercase px-4 sm:px-5 py-3">
                  <span className="sm:hidden">View the code</span>
                  <span className="max-sm:hidden">Read the code on GitHub</span>
                </a>
                <Link href="/api-docs" className="ledger-btn-quiet inline-block whitespace-nowrap no-underline font-mono text-[0.75rem] tracking-[0.14em] indent-[0.14em] uppercase px-4 sm:px-5 py-3">
                  <span className="sm:hidden">Free API</span>
                  <span className="max-sm:hidden">Use the free API</span>
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function Step({ n, id, title, children }: { n?: number; id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8 flex flex-col gap-5">
      <div>
        {n && <p className={`${HEAD} m-0 mb-2`}>Step {n}</p>}
        <h2 className="font-display text-ink text-[1.6rem] sm:text-[2rem] font-bold leading-tight m-0">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// Holds a step's worked figures; a placeholder until they arrive.
function Exhibit({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  return (
    <div data-exhibit className="max-w-[46rem]">
      {ready ? children : <div className="paper-skeleton h-24" />}
    </div>
  );
}

function TapeRow({ label, detail, figure, lowers, children }: { label: string; detail: string; figure: string; lowers?: boolean; children?: React.ReactNode }) {
  return (
    <div data-row className="grid grid-cols-[1fr_auto] sm:grid-cols-[14rem_1fr_5.5rem] gap-x-5 gap-y-2 items-center py-2.5 border-t border-rule">
      <div className="min-w-0">
        <p className="text-ink text-[0.9rem] m-0 leading-tight">{label}</p>
        <p className="font-mono text-ink2 text-[0.75rem] m-0 mt-0.5 truncate">{detail}</p>
      </div>
      <div className="order-last col-span-2 sm:order-none sm:col-span-1">{children}</div>
      <span className={`${NUM} text-right whitespace-nowrap ${lowers ? 'text-ink max-sm:text-red-ink' : 'text-ink'}`}>{figure}</span>
    </div>
  );
}

// `short` is the label a phone shows, where three figures share one line.
function Figure({ label, short, value }: { label: string; short?: string; value: string }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <span className={HEAD}>
        {short ? <><span className="sm:hidden">{short}</span><span className="max-sm:hidden">{label}</span></> : label}
      </span>
      <span data-figure className="font-mono tabular-nums text-ink text-[clamp(0.95rem,4.8vw,1.2rem)] sm:text-[1.5rem] leading-none whitespace-nowrap">
        <Typed text={value} />
      </span>
    </div>
  );
}

// The loop the whole product runs on, as four step names in a ruled row.
// The last step leads back to the first, which the sentence above says.
function Cycle() {
  const steps = ['Predict', 'Settle', 'Retrain', 'Promote'];
  return (
    <ol
      aria-label="The loop: predict, settle, retrain, promote the new model if it wins, and round again"
      className="list-none m-0 mt-8 py-3.5 px-0 max-w-[46rem] flex items-center justify-between sm:justify-start gap-x-2 sm:gap-x-5 border-y border-rule text-ink text-[0.9rem] sm:text-[0.98rem] leading-snug"
    >
      {steps.map((step, i) => (
        <li key={step} className="contents">
          <span>{step}</span>
          {i < steps.length - 1 && <span aria-hidden className="text-ink3">→</span>}
        </li>
      ))}
    </ol>
  );
}
