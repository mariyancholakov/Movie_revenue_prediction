'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { EASE, gsap, motion, useGSAP } from '@/lib/motion';
import { RunningHead } from '@/components/RunningHead';
import { DecayCurve } from '@/components/DecayCurve';
import { GhostReel } from '@/components/GhostReel';
import { WireDown } from '@/components/WireDown';
import { Typed, typeOut } from '@/components/Typed';
import type { DecayCurveData } from '@/components/types';
import { API_URL } from '@/lib/api';
import { fmtMoney } from '@/lib/money';

const REPO = 'https://github.com/mariyancholakov/Movie_revenue_prediction';

// The groups /api/explain splits a film's multiplier into (model_lib.RUN_EXPLAIN_GROUPS).
type Group = 'opening' | 'budget' | 'runtime' | 'genre' | 'timing' | 'franchise' | 'origin' | 'era'
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
  decay_curve: (DecayCurveData & { half_life?: number | null }) | null;
}

interface Film { tmdb_id: number; title: string; poster: string; budget: number | null; decay_rate: number | null }

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

const HEAD = 'font-mono text-[0.62rem] tracking-[0.14em] text-ink3 uppercase';
const NUM = 'font-mono tabular-nums text-[0.9rem] sm:text-[1.02rem]';
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
    budget: n('budget') ? fmtMoney(n('budget')) : 'Not reported',
    runtime: n('runtime') ? `${n('runtime')} min` : 'Not reported',
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
  budget: 'Budget',
  runtime: 'Runtime',
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
  const [record, setRecord] = useState<{ runs: number; median: number } | null>(null);
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
        const errs = rows.filter(r => r.actual_revenue > 0)
          .map(r => Math.abs(r.predicted_revenue - r.actual_revenue) / r.actual_revenue * 100)
          .sort((a, b) => a - b);
        if (!errs.length) return;
        const mid = errs.length / 2;
        const median = errs.length % 2 ? errs[Math.floor(mid)] : (errs[mid - 1] + errs[mid]) / 2;
        setRecord({ runs: errs.length, median });
      })
      .catch(() => {});
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
    <main className="min-h-screen text-ink font-sans">
      <RunningHead active="how" stamp={false} />

      <div ref={root} className="px-4 sm:px-8 lg:px-14 pt-9 pb-24 max-w-[74rem] mx-auto w-full">
        {/* This week's films run faintly behind the page, on a ghost reel
            pinned low on the screen that the steps scroll over */}
        <GhostReel posters={films.map(f => f.poster).filter(Boolean)} fixed top="64%" tilt={-8} size={1.6} ink={0.045} />
        <div>
          <p className={`${HEAD} mb-3`}>How it works</p>
          <h1 className="font-display text-ink text-[2.2rem] sm:text-[3.2rem] font-bold leading-[1.02] m-0 mb-4 max-w-3xl">
            How a number gets made
          </h1>
          <p className={`${PROSE} pb-8`}>
            MOVIEGROSS takes one hard fact, what a film made in its US opening weekend,
            and asks how many times over it will earn that back around the world. Below
            is the whole process, step by step, worked through with the real figures for
            a film in theaters now.
          </p>
        </div>

        {/* The worked example: every figure on the page below is this film's. */}
        <div className="rule-double" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
          <label htmlFor="film" className={HEAD}>Worked example</label>
          {films.length > 0 ? (
            <select
              id="film"
              value={filmId ?? ''}
              onChange={e => setFilmId(Number(e.target.value))}
              className="search-field bg-transparent font-mono text-ink text-[0.95rem] sm:text-[1.05rem] border-0 border-b border-ink/40 py-1 pl-1 pr-6 cursor-pointer max-w-full"
            >
              {films.map(f => <option key={f.tmdb_id} value={f.tmdb_id}>{f.title}</option>)}
            </select>
          ) : status === 'loading' ? (
            <span className="paper-skeleton inline-block h-6 w-48" />
          ) : null}
          {data && (
            <Link href={`/movie/${data.tmdb_id}`} className="ml-auto font-mono text-[0.7rem] tracking-[0.12em] uppercase text-ink2 underline decoration-ink/30 underline-offset-4 hover:text-red">
              Its full page →
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
                    className={`flex items-baseline gap-3 py-1.5 no-underline text-[0.8rem] transition-colors ${active === s.id ? 'text-ink font-semibold' : 'text-ink3 hover:text-ink'}`}
                  >
                    <span className="font-mono text-[0.7rem] w-4 text-right">{i < 7 ? i + 1 : '·'}</span>
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
                A film can&rsquo;t be priced before it opens. On the Monday after its
                first Friday-to-Sunday in US theaters, Box Office Mojo reports what it took.
                That one figure sets the scale of the whole run: a film that opens to
                $100M isn&rsquo;t going to finish at $20M.
              </p>
              <Exhibit ready={!!data}>
                {data && (
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <p className={`${HEAD} m-0`}>Box Office Mojo · US opening weekend · {data.title}</p>
                    <p data-figure className={`${NUM} text-ink m-0`}><Typed text={fmtMoney(data.opening_weekend)} /></p>
                  </div>
                )}
              </Exhibit>
            </Step>

            {/* 2 ─ The file */}
            <Step n={2} id="file" title="Then the model reads the file">
              <p className={PROSE}>
                TMDB supplies what kind of film it is and who made it; Box Office Mojo adds
                how many theaters it opened in, its rating, its distributor and what it
                opened to in other countries. The director and leads are read by their
                record: what their earlier films made. There are no reviews and no
                trailer views, only facts that are on record the week a film opens.
              </p>
              <Exhibit ready={!!file}>
                {file && (
                  <dl className="m-0 border-t border-ink">
                    {(['budget', 'runtime', 'genre', 'timing', 'franchise', 'origin', 'rating', 'talent', 'abroad', 'era'] as Group[]).map(g => (
                      <div key={g} data-row className="grid grid-cols-[8.5rem_1fr] sm:grid-cols-[13rem_1fr] gap-4 py-2.5 border-b border-rule">
                        <dt className={`${HEAD} pt-[0.2rem]`}>{LABELS[g]}</dt>
                        <dd className="m-0 font-mono text-ink text-[0.9rem]">{file[g]}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Exhibit>
              <p className={`${PROSE} text-[0.85rem] sm:text-[0.88rem]`}>
                Left out on purpose: TMDB&rsquo;s popularity score. In the training data it
                was measured years after each release, while a new film is scored in its
                opening week, so the model would read every new film as unusually hot.
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
                It answers those two questions separately, with two gradient-boosted tree
                ensembles (XGBoost) trained on 5,389 past releases: how many times its
                opening the film will make in the US, and how much bigger the world makes
                that. Together they start from the multiplier of a typical film and let
                each part of the file push it up or down.
                {up && down && data && (
                  <> For {data.title}, the biggest push came from {LABELS[up[0]].toLowerCase()} (×{x2(up[1])}),
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
                    <TapeRow label="Starting point" detail="The typical film" figure={`${x2(data.base_multiplier)}×`} />
                    {factors.map(([g, f]) => (
                      <TapeRow key={g} label={LABELS[g]} detail={file[g]} figure={`× ${x2(f)}`}>
                        <div className="relative h-4 w-full">
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
                    ))}
                    <div className="rule-double" />
                    <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[14rem_1fr_5.5rem] gap-x-5 items-baseline py-3">
                      <span className="text-ink font-semibold text-[0.92rem]">Multiplier</span>
                      <span className="hidden sm:block" />
                      <span data-figure className={`${NUM} text-ink text-right`}><Typed text={`= ${x2(data.multiplier)}×`} /></span>
                    </div>
                  </div>
                )}
              </Exhibit>
              <p className={`${PROSE} text-[0.85rem] sm:text-[0.88rem]`}>
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
                translates into a global run. Beside it the film page prints a likely range,
                read off the model&rsquo;s own misses on films it never saw: eight in ten
                films like it finished inside. It is wide for a small opening and narrows
                as the weekends come in.
              </p>
              <Exhibit ready={!!data}>
                {data && (
                  <div className="grid grid-cols-[1fr_auto_1fr] sm:grid-cols-[1fr_auto_1fr_auto_1.3fr] items-end gap-x-3 sm:gap-x-5 gap-y-4">
                    <Figure label="US opening weekend" value={fmtMoney(data.opening_weekend)} />
                    <span className={`${NUM} text-ink3 pb-[0.1rem]`}>×</span>
                    <Figure label="Multiplier" value={`${x2(data.multiplier)}×`} />
                    <span className={`${NUM} text-ink3 pb-[0.1rem] col-start-2 sm:col-start-auto`}>=</span>
                    <Figure label="Predicted worldwide total" value={fmtMoney(data.predicted_revenue)} />
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
                {' '}The curve itself is a read-out. The weekends aren&rsquo;t: after each
                one, the forecast is made again with the run so far, the gross to date,
                the last weekend and how hard it dropped. On films the model never saw, the
                median miss falls from 29% at opening to 17% after four weekends and 14%
                after eight.
              </p>
              <Exhibit ready={!!data}>
                {data && (curve && curve.weeks.length > 1 ? (
                  <DecayCurve data={curve} />
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
                <Link href="/finished" className="text-ink underline decoration-red underline-offset-4 hover:text-red">The Ledger</Link>:
                predicted against actual, misses included. The call it&rsquo;s held to is
                the one made on opening weekend, not the late forecast, which by then has
                most of the run in hand. The actual is the same worldwide figure the model
                learns from: Box Office Mojo&rsquo;s, or TMDB&rsquo;s where Mojo has no
                foreign grosses.
              </p>
              <Exhibit ready={record !== null || status === 'error'}>
                {record && (
                  <div className="grid grid-cols-2 gap-5">
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
                2017 and is scored on the 1,107 released since, the same job it does live,
                pricing films newer than anything it has seen. It replaces the current model
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
                    ['One multiplier, TMDB facts only', '$53M', '37.9%'],
                    ['US run × trip abroad, Mojo facts (now live)', '$43M', '29.3%'],
                  ].map(([name, mae, med]) => (
                    <div key={name} data-row className="grid grid-cols-[1fr_5rem_5rem] sm:grid-cols-[1fr_8rem_8rem] gap-x-4 items-baseline py-3 border-t border-rule">
                      <span className="text-ink text-[0.9rem]">{name}</span>
                      <span className={`${NUM} text-ink text-right`}>{mae}</span>
                      <span className={`${NUM} text-ink text-right`}>{med}</span>
                    </div>
                  ))}
                </div>
                <p className={`${HEAD} normal-case tracking-[0.04em] mt-2 mb-0`}>
                  Opening-weekend calls, scored on films released 2017 and later, unseen in training.
                </p>
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
                ].map(([head, body]) => (
                  <li key={head}>
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
                this page are all on GitHub; the model lives in{' '}
                <code className="font-mono text-ink text-[0.9em]">model_lib.py</code> and the exam in{' '}
                <code className="font-mono text-ink text-[0.9em]">retrain.py</code>.
              </p>
              <a href={REPO} target="_blank" rel="noopener noreferrer" className="ledger-btn inline-block no-underline font-mono text-[0.75rem] tracking-[0.14em] uppercase px-5 py-3">
                Read the code on GitHub
              </a>
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
        <p className={`${HEAD} m-0 mb-2`}>{n ? `Step ${n}` : 'Fine print'}</p>
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

function TapeRow({ label, detail, figure, children }: { label: string; detail: string; figure: string; children?: React.ReactNode }) {
  return (
    <div data-row className="grid grid-cols-[1fr_auto] sm:grid-cols-[14rem_1fr_5.5rem] gap-x-5 gap-y-2 items-center py-2.5 border-t border-rule">
      <div className="min-w-0">
        <p className="text-ink text-[0.9rem] m-0 leading-tight">{label}</p>
        <p className="font-mono text-ink3 text-[0.7rem] m-0 mt-0.5 truncate">{detail}</p>
      </div>
      <div className="order-last col-span-2 sm:order-none sm:col-span-1">{children}</div>
      <span className={`${NUM} text-ink text-right whitespace-nowrap`}>{figure}</span>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <span className={HEAD}>{label}</span>
      <span data-figure className="font-mono tabular-nums text-ink text-[1.2rem] sm:text-[1.5rem] leading-none">
        <Typed text={value} />
      </span>
    </div>
  );
}

// The loop the whole product runs on, set as one line of type.
function Cycle() {
  const parts = ['Predict', 'Settle', 'Retrain', 'Promote if it wins'];
  return (
    <p className="font-mono text-ink2 text-[0.72rem] sm:text-[0.78rem] tracking-[0.12em] uppercase m-0 flex flex-wrap items-center gap-x-3 gap-y-1 max-w-[46rem]">
      {parts.map(p => (
        <span key={p} className="flex items-center gap-3">
          <span className="text-ink">{p}</span><span aria-hidden className="text-ink3">→</span>
        </span>
      ))}
      <span className="text-ink3">back to predict</span>
    </p>
  );
}
