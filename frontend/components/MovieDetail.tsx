'use client';
import { useRef, useState } from "react";
import { EASE, gsap, motion, useGSAP } from "@/lib/motion";
import { estProfit } from "@/lib/profit";
import { parseDay } from "@/lib/release";
import { fmtMoney, fmtRange } from "@/lib/money";
import { Poster } from "./Poster";
import type { Movie, Prediction } from "./types";
import { StatCard } from "./StatCard";
import { DecayCurve } from "./DecayCurve";
import { ForecastChart } from "./ForecastChart";
import { Typed, typeOut } from "./Typed";
import { FilmLeader } from "./FilmLeader";
import { useWidth } from "@/lib/useWidth";

const fmt = fmtMoney;

// Below this US opening a film is a limited release, where the model (trained
// on the typical wide-release run) is least reliable.
const LIMITED_OPENING = 1_000_000;

const fmtRuntime = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// A calendar date as written (parseDay), so 'YYYY-MM-DD' never shifts to the
// day before in time zones west of UTC.
const fmtDate = (d: string) => {
  const t = parseDay(d) ?? new Date(d);
  return Number.isNaN(t.getTime())
    ? d
    : t.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// Why each missing chart is missing, one sentence apiece. The decay chart
// needs three US weekends and the forecast chart two; `weekends` is how many
// the API sent. None at all, days after the opening, means the weekly figures
// aren't on record rather than not in yet.
function chartGaps(
  hasDecay: boolean, hasForecast: boolean, weekends: number, settled: boolean, daysSinceRelease: number,
): string[] {
  if (hasDecay && hasForecast) return [];
  if (weekends === 0 && daysSinceRelease >= 4)
    return ["No weekly US grosses are on record for this film, so there are no charts to draw."];
  if (!hasDecay && !hasForecast)
    return [settled
      ? "This run was too short to chart its weekends."
      : "The charts start after the film’s second US weekend."];
  if (!hasDecay)
    return [weekends < 3
      ? settled
        ? "No decay chart: the run was too short to fit one."
        : `The decay chart starts after the third US weekend; ${weekends} ${weekends === 1 ? "is" : "are"} in so far.`
      : "No decay chart: the weekly US grosses for this film aren’t on record."];
  // The decay chart is up, so there were weekends: the snapshot just lacks them.
  return ["No forecast chart: the weekend-by-weekend calls can’t be rebuilt for this film."];
}

// Reader-facing copy for each failure the API reports: a short headline and
// one or two sentences saying why, and what happens next.
const RETRYABLE = new Set<Prediction["code"]>(["tmdb_unavailable", "box_office_unavailable", "network", "internal", "rate_limited"]);

// `usOpening` / `openedAbroad` are display dates: the US release, and the
// film's first release elsewhere when that came earlier (else null).
function errorCopy(
  code: Prediction["code"], daysSinceRelease: number, usOpening: string, openedAbroad: string | null,
): { title: string; body: string } {
  const days = Math.floor(daysSinceRelease);
  const abroad = openedAbroad ? ` It first opened abroad on ${openedAbroad}.` : "";
  switch (code) {
    case "not_released":
      return {
        title: "Not released yet",
        body: "Predictions start from a film\u2019s US opening weekend, so this one opens up after its first weekend in theaters.",
      };
    case "no_opening_weekend":
      if (daysSinceRelease < 0)
        return {
          title: "Not in US theaters yet",
          body: `It opens in the US on ${usOpening}.${abroad} We predict from the first US weekend\u2019s gross, which is published the Monday after.`,
        };
      if (days < 4)
        return {
          title: "Opening weekend in progress",
          body: `It opened in US theaters ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}.${abroad} We predict from the first US weekend\u2019s gross, which is published the Monday after. Check back then.`,
        };
      if (days < 14)
        return {
          title: "Opening figures not in yet",
          body: "The first weekend\u2019s US gross hasn\u2019t been published yet. It usually appears within a few days of the weekend.",
        };
      return {
        title: "No US opening weekend",
        body: "No US opening weekend was ever reported for this film, most likely because it had a limited or non-US release. Without it there\u2019s nothing to predict from.",
      };
    case "no_us_release":
      return {
        title: "No US box office",
        body: "Box Office Mojo has no US listing for this film, so there\u2019s no opening weekend to predict from.",
      };
    case "no_listing":
      return {
        title: "No box-office listing",
        body: "This film isn\u2019t linked to a box-office record yet, so there are no figures to predict from.",
      };
    case "insufficient_data":
      return {
        title: "Missing film details",
        body: "TMDB is missing details the model needs, such as the release date or runtime.",
      };
    case "not_found":
      return { title: "Film not found", body: "There\u2019s no film with this id on TMDB." };
    case "tmdb_unavailable":
      return {
        title: "Film database unavailable",
        body: "TMDB, where our film details come from, isn\u2019t responding. Try again in a minute.",
      };
    case "box_office_unavailable":
      return {
        title: "Box office source unavailable",
        body: "Box Office Mojo, where the weekend grosses come from, isn\u2019t responding. Try again in a minute.",
      };
    case "rate_limited":
      return {
        title: "Too many requests",
        body: "You\u2019ve run a lot of predictions in a short time. Wait a minute, then try again.",
      };
    case "network":
      return {
        title: "Can\u2019t reach MOVIEGROSS",
        body: "The prediction service didn\u2019t answer. Check your connection and try again.",
      };
    default:
      return { title: "Something went wrong", body: "The prediction failed on our side. Please try again." };
  }
}

interface MovieDetailProps {
  selected: Movie;
  prediction: Prediction | null;
  predicting: boolean;
  onBack: () => void;
  onPredict: () => void;
}

// One ruled row of the particulars ledger.
// `minor` rows drop out on phones, where the page leads with the answer.
function Particular({ label, children, minor = false }: { label: string; children: React.ReactNode; minor?: boolean }) {
  return (
    <div className={`${minor ? "hidden sm:flex" : "flex"} items-baseline gap-4 py-2 border-b border-rule`}>
      <span className="font-sans text-[0.8rem] font-medium text-ink2 w-24 shrink-0">
        {label}
      </span>
      <span className="font-sans text-[0.85rem] text-ink leading-snug">{children}</span>
    </div>
  );
}

export function MovieDetail({
  selected,
  prediction,
  predicting,
  onBack,
  onPredict,
}: MovieDetailProps) {
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");
  // Capture "now" once at mount. Reading the clock during render is impure
  // (react-hooks/purity) and can drift between the server render and hydration;
  // these release-timing flags only need a single stable reading.
  const [now] = useState(() => Date.now());
  const root = useRef<HTMLElement>(null);
  // The charts are drawn at the width of this column, measured before any
  // prediction exists, so their line-drawing starts from the right length.
  const [measure, chartWidth] = useWidth();

  // When the numbers land they are typed up like a filed dispatch: the rule
  // draws, then each figure in the grid is
  // struck in turn, then the decay chart inks its line and plots each
  // weekend. A failed prediction just slides its notice in.
  useGSAP(() => {
    if (!prediction) return;
    motion(() => {
      if (prediction.error) {
        gsap.from('[role=alert]', { x: -12, opacity: 0, duration: 0.45, ease: EASE });
        return;
      }
      const tl = gsap.timeline({ defaults: { ease: EASE } })
        .from('[data-ledger-rule]', { scaleX: 0, transformOrigin: 'left center', duration: 0.6, ease: 'power2.inOut' }, 0);

      const cells = gsap.utils.toArray<HTMLElement>('[data-cell]');
      const figures = cells.map(c => c.querySelector<HTMLElement>('[data-figure]')!);
      tl.from(cells, { opacity: 0, duration: 0.25, stagger: 0.04 }, 0);
      figures.forEach((fig, i) => typeOut(tl, fig, { pace: 0.75, keepCaret: i === figures.length - 1 }));

      tl.from('[data-ledger-follow]', { y: 12, opacity: 0, duration: 0.5, stagger: 0.1 }, '-=0.2');

      const line = root.current?.querySelector<SVGPathElement>('[data-line]');
      if (line) {
        const len = line.getTotalLength();
        tl.fromTo(line, { strokeDasharray: len, strokeDashoffset: len },
          { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut', clearProps: 'strokeDasharray,strokeDashoffset' }, '-=0.25')
          .from('[data-area]', { opacity: 0, duration: 0.6 }, '<0.3')
          .from('[data-dot]', { scale: 0, transformOrigin: '50% 50%', duration: 0.3, stagger: 0.06, ease: 'back.out(2)' }, '<')
          .from('[data-fit]', { opacity: 0, duration: 0.5 }, '-=0.3');
      }
    });
  }, { scope: root, dependencies: [prediction] });

  const releaseTime = selected.release_date ? new Date(selected.release_date).getTime() : NaN;
  const notReleased = !Number.isNaN(releaseTime) && releaseTime > now;
  // Opening-weekend timing counts from the US release, which can trail the
  // film's first release elsewhere.
  const usRelease = parseDay(selected.us_release_date)?.getTime() ?? releaseTime;
  const daysSinceRelease = Number.isNaN(usRelease)
    ? Infinity
    : (now - usRelease) / 86_400_000;
  // TMDB's release date is the film's first release anywhere; when the US
  // came later, say so, or 'opened today' contradicts 'Released'.
  const usDay = parseDay(selected.us_release_date);
  const firstDay = parseDay(selected.release_date);
  const laterInUS = usDay && firstDay && usDay.getTime() > firstDay.getTime() ? usDay : null;

  // Shares this film's page. Phones get the native share sheet; elsewhere the
  // link is copied. navigator.clipboard is missing on insecure origins and
  // writeText rejects when permission is denied, so report failure instead of
  // claiming success. Dismissing the share sheet is not a failure.
  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: `${selected.title} \u2014 MOVIEGROSS`, url });
      } catch {}
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareState("copied");
    } catch {
      setShareState("failed");
    }
    setTimeout(() => setShareState("idle"), 2500);
  };

  return (
    <section ref={root} className="px-4 sm:px-8 lg:px-14 py-7 sm:py-10">
      <div ref={measure} aria-hidden className="h-0" />
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 mb-7">
        <button
          onClick={onBack}
          className="font-sans text-[0.75rem] tracking-[0.1em] font-semibold text-ink2
                     hover:text-red transition-colors bg-transparent border-0 py-3.5 -my-3.5 px-0"
        >
          ‹ ALL FILMS
        </button>
        <button
          onClick={handleShare}
          title="Copy a link to this film’s page"
          aria-live="polite"
          className="inline-flex items-center gap-1.5 font-sans text-[0.75rem] tracking-[0.1em] font-semibold
                     text-ink2 hover:text-red transition-colors bg-transparent border-0 py-3.5 -my-3.5 px-0"
        >
          <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            {shareState === "copied" ? (
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            ) : (
              <>
                <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
                <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
              </>
            )}
          </svg>
          {shareState === "copied"
            ? "LINK COPIED"
            : shareState === "failed"
              ? "COULDN\u2019T COPY"
              : "SHARE THIS FILM"}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-7 sm:gap-10">
        {/* Poster plate */}
        <div className="shrink-0 mx-auto sm:mx-0">
          <div className="relative w-52 sm:w-60 md:w-72 aspect-[2/3] plate overflow-hidden bg-panel">
            <Poster
              src={selected.poster}
              alt={selected.title}
              fill
              sizes="(max-width: 640px) 208px, (max-width: 768px) 240px, 288px"
              className="object-cover"
              preload
            />
          </div>
        </div>

        {/* Entry */}
        <div className="flex flex-col flex-1 min-w-0">
          <h1 className="font-display text-ink text-[1.9rem] sm:text-[2.9rem] font-bold leading-[1.02] m-0">
            {selected.title}
          </h1>

          {selected.genres && selected.genres.length > 0 && (
            <p className="font-sans text-[0.85rem] text-ink2 mt-2 mb-0">
              {selected.genres.join("  ·  ")}
            </p>
          )}

          {/* The answer comes first: the button, then the predicted total in
              its place, under the title and above everything about the film. */}
          <div className="mt-6" aria-live="polite" aria-busy={predicting}>
            {notReleased && (
              <div className="border-t border-ink/25 pt-3">
                <p className="font-display text-ink text-[1.05rem] font-bold mb-1">Not yet in theaters</p>
                <p className="text-ink2 text-[0.83rem] leading-[1.55] m-0">
                  The ledger opens once the film releases and the box office starts reporting.
                </p>
              </div>
            )}

            {!notReleased && !prediction && !predicting && (
              <button
                onClick={onPredict}
                className="ledger-btn w-full sm:w-1/2 h-14 font-sans font-bold text-[0.82rem] tracking-[0.18em]"
              >
                RUN THE NUMBERS
              </button>
            )}

            {!notReleased && predicting && !prediction && (
              // Same size as the button it replaces, so the page doesn't jump
              <div className="w-full sm:w-1/2 h-14 flex items-center justify-center border border-ink/25 px-5">
                <FilmLeader />
              </div>
            )}

            {prediction && !prediction.error && (
              <div data-cell>
                <p className="font-sans text-ink2 text-[0.9rem] font-semibold m-0 mb-2">
                  Predicted worldwide total
                </p>
                <p
                  data-figure
                  className="font-mono text-ink font-bold tabular-nums leading-none m-0 text-[2.9rem] min-[360px]:text-[3.3rem] sm:text-[4.4rem]"
                >
                  <Typed text={fmt(prediction.predicted_revenue)} />
                </p>
                {/* Struck beneath the figure like the total line in a ledger. */}
                <div data-ledger-rule className="rule-double mt-4" />
              </div>
            )}
          </div>

          {selected.overview && (
            <p className="text-ink2 text-[0.9rem] leading-[1.65] mt-7 mb-5 max-w-prose">
              {selected.overview}
            </p>
          )}

          {/* Particulars ledger */}
          <div className={`border-t border-ink/25 ${selected.overview ? "" : "mt-7"}`}>
            <Particular label="Released">{fmtDate(selected.release_date)}</Particular>
            {laterInUS && (
              <Particular label="In the US">{fmtDate(selected.us_release_date!)}</Particular>
            )}
            {(selected.runtime ?? 0) > 0 && (
              <Particular label="Runtime">{fmtRuntime(selected.runtime!)}</Particular>
            )}
            {selected.vote_average != null && (
              <Particular label="TMDB" minor>
                <span className="font-mono tabular-nums">{selected.vote_average.toFixed(1)}</span>
                <span className="text-ink3"> / 10</span>
              </Particular>
            )}
            {selected.director && <Particular label="Directed by">{selected.director}</Particular>}
            {selected.cast && selected.cast.length > 0 && (
              <Particular label="Starring" minor>{selected.cast.join(", ")}</Particular>
            )}
            {(selected.budget ?? 0) > 0 && (
              <Particular label="Budget" minor>
                <span className="font-mono tabular-nums">{fmt(selected.budget!)}</span>
              </Particular>
            )}
          </div>
        </div>
      </div>

      {/* Prediction ledger */}
      {prediction && !prediction.error && (() => {
        const lam = prediction.decay_curve?.decay_rate ?? null;
        const profit = (selected.budget ?? 0) > 0 ? estProfit(prediction.predicted_revenue, selected.budget!) : null;
        const settled = (prediction.actual_revenue ?? 0) > 0 ? prediction.actual_revenue! : null;
        const hasDecay = (prediction.decay_curve?.weeks.length ?? 0) > 2;
        const hasForecast = (prediction.forecast_history?.length ?? 0) > 1;
        const chartNotes = chartGaps(
          hasDecay, hasForecast,
          Math.max(prediction.decay_curve?.weeks.length ?? 0, prediction.forecast_history?.length ?? 0),
          settled != null, daysSinceRelease,
        );
        return (
        <div className="mt-11">
          <div className="mb-11">
          {/* What stands behind the total above: the opening it grew from and
              the range around it. A settled run adds a second row: its final gross and
              the miss. Narrower screens set them two by two, the odd one out
              spanning the row, so no figure outgrows its cell. */}
          <div className={`grid grid-cols-2 border-t border-l border-ink/20 max-md:[&>*:last-child:nth-child(odd)]:col-span-2 ${settled != null
            ? "md:grid-cols-6 md:[&>*]:col-span-2 md:[&>*:nth-child(n+4)]:col-span-3"
            : "md:grid-cols-3"}`}>
            {[
              <StatCard key="ow" label="US opening weekend" value={fmt(prediction.opening_weekend)} />,
              // Where half of films like it finished (ranges.py).
              <StatCard key="rg" label="Prediction range"
                value={prediction.forecast_range ? fmtRange(...prediction.forecast_range) : "\u2014"} />,
              // In the red when it's predicted to lose money, as on Rankings.
              profit != null
                ? <StatCard key="pf" label="Est. profit" value={fmt(profit)} accent={profit < 0} />
                : <StatCard key="pf" label="Est. profit" value={"\u2014"} />,
              settled != null && (
                <StatCard key="fg" label="Final worldwide" value={fmt(settled)} />
              ),
              settled != null && (() => {
                // Actual minus predicted, as on The Ledger: red when the film
                // fell short of the call.
                const diff = settled - prediction.predicted_revenue;
                return (
                  <StatCard key="df" label="Difference" accent={diff < 0}
                    value={(diff > 0 ? "+" : "") + fmt(diff)} />
                );
              })(),
            ].filter(Boolean).map((cell, i) => (
              <div key={i} data-cell className="border-r border-b border-ink/20">
                {cell}
              </div>
            ))}
          </div>

          {/* The model learned from wide releases; from a tiny opening it
              can't tell whether a film will expand or vanish. */}
          {prediction.opening_weekend < LIMITED_OPENING && (
            <p data-ledger-follow className="font-sans text-[0.85rem] text-ink2 mt-3 mb-0 leading-relaxed">
              Limited release: an opening this small makes the prediction rough.
            </p>
          )}
          </div>

          {hasDecay && prediction.decay_curve && (
            <div data-ledger-follow className="mb-11">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-5">
                <h2 className="font-display text-ink text-[1.25rem] font-bold m-0">US Weekend Gross Decay</h2>
                {/* decay_rate λ fits weekend gross ∝ e^(−λ·week), so each
                    weekend keeps e^(−λ) of the one before. On a phone it sits
                    on one line under the heading, left-aligned with it. */}
                {lam != null && (
                  <p className="m-0 flex items-baseline gap-2 sm:block sm:text-right">
                    <span className="sm:block font-sans text-[0.8rem] font-medium text-ink2 sm:mb-1 whitespace-nowrap">Drop per weekend</span>
                    <span className="font-mono text-ink text-[1.1rem] tabular-nums">{`\u2212${Math.round((1 - Math.exp(-lam)) * 100)}%`}</span>
                  </p>
                )}
              </div>
              <DecayCurve data={prediction.decay_curve} width={chartWidth ?? undefined} />
            </div>
          )}

          {/* A missing chart says why rather than leaving the space empty. */}
          {chartNotes.map((note) => (
            <p key={note} data-ledger-follow className="text-ink2 text-[0.85rem] italic mb-11">
              {note}
            </p>
          ))}

          {hasForecast && (
            <div data-ledger-follow>
              <h2 className="font-display text-ink text-[1.25rem] font-bold m-0 mb-3">The Forecast, Weekend by Weekend</h2>
              <p className="text-ink2 text-[0.85rem] leading-[1.6] max-w-prose mt-0 mb-5">
                The worldwide prediction after each US weekend, with its range shaded.
              </p>
              <ForecastChart history={prediction.forecast_history!} final={settled} width={chartWidth ?? undefined} />
            </div>
          )}
        </div>
        );
      })()}

      {prediction?.error && (() => {
        const { title, body } = errorCopy(
          prediction.code, daysSinceRelease,
          fmtDate(selected.us_release_date || selected.release_date),
          laterInUS ? fmtDate(selected.release_date) : null,
        );
        return (
          <div role="alert" className="mt-8 border-t border-red pt-3 max-w-prose">
            <p className="font-display text-ink text-[1.05rem] font-bold m-0 mb-1">{title}</p>
            <p className="text-ink2 text-[0.85rem] leading-[1.55] m-0">{body}</p>
            <div className="flex items-center gap-5 mt-3">
              {RETRYABLE.has(prediction.code) && (
                <button
                  onClick={onPredict}
                  disabled={predicting}
                  className="font-sans text-[0.75rem] tracking-[0.1em] font-semibold text-red
                             bg-transparent border-0 py-3.5 -my-3.5 px-0 hover:text-ink transition-colors disabled:opacity-50"
                >
                  {predicting ? "TRYING…" : "TRY AGAIN"}
                </button>
              )}
            </div>
          </div>
        );
      })()}
    </section>
  );
}
