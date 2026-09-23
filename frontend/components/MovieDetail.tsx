'use client';
import { useRef, useState } from "react";
import { EASE, gsap, motion, useGSAP } from "@/lib/motion";
import { estProfit } from "@/lib/profit";
import { Poster } from "./Poster";
import type { Movie, Prediction } from "./types";
import { StatCard } from "./StatCard";
import { DecayCurve } from "./DecayCurve";

const fmt = (n: number) => {
  const a = Math.abs(n);
  return (n < 0 ? "\u2212$" : "$") + (a >= 1e9 ? (a / 1e9).toFixed(2) + "B" : (a / 1e6).toFixed(1) + "M");
};


const fmtRuntime = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const fmtDate = (d: string) => {
  const t = new Date(d);
  return Number.isNaN(t.getTime())
    ? d
    : t.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// Reader-facing copy for each failure the API reports: a short headline and
// one or two sentences saying why, and what happens next.
const RETRYABLE = new Set<Prediction["code"]>(["tmdb_unavailable", "box_office_unavailable", "network", "internal"]);

function errorCopy(code: Prediction["code"], daysSinceRelease: number): { title: string; body: string } {
  const days = Math.floor(daysSinceRelease);
  switch (code) {
    case "not_released":
      return {
        title: "Not released yet",
        body: "Predictions start from a film\u2019s US opening weekend, so this one opens up after its first weekend in theaters.",
      };
    case "no_opening_weekend":
      if (days < 4)
        return {
          title: "Opening weekend in progress",
          body: `It opened ${days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}. We predict from the first weekend\u2019s US gross, which is published the Monday after. Check back then.`,
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
  fullPage?: boolean;
}

// One ruled row of the particulars ledger.
function Particular({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 py-2 border-b border-rule">
      <span className="font-mono text-[0.58rem] tracking-[0.14em] text-ink3 uppercase w-24 shrink-0">
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

  // When the numbers land: the rule draws, the four figures post one after
  // another, then the decay chart inks its line and plots each weekend.
  // A failed prediction just slides its notice in.
  useGSAP(() => {
    if (!prediction) return;
    motion(() => {
      if (prediction.error) {
        gsap.from('[role=alert]', { x: -12, opacity: 0, duration: 0.45, ease: EASE });
        return;
      }
      const tl = gsap.timeline({ defaults: { ease: EASE } })
        .from('[data-ledger-rule]', { scaleX: 0, transformOrigin: 'left center', duration: 0.6, ease: 'power2.inOut' })
        .from('[data-ledger-label]', { opacity: 0, duration: 0.3 }, '-=0.3')
        .from('[data-cell]', { y: 16, opacity: 0, duration: 0.5, stagger: 0.08 }, '-=0.15')
        .from('[data-ledger-follow]', { y: 12, opacity: 0, duration: 0.5, stagger: 0.1 }, '-=0.2');

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
  const daysSinceRelease = Number.isNaN(releaseTime)
    ? Infinity
    : (now - releaseTime) / 86_400_000;

  // navigator.clipboard is missing on insecure origins and writeText rejects
  // when permission is denied, so report failure instead of claiming success.
  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareState("copied");
    } catch {
      setShareState("failed");
    }
    setTimeout(() => setShareState("idle"), 2000);
  };

  return (
    <section ref={root} className="px-4 sm:px-8 lg:px-14 py-7 sm:py-10">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 mb-7">
        <button
          onClick={onBack}
          className="font-sans text-[0.68rem] tracking-[0.14em] font-semibold text-ink2
                     hover:text-red transition-colors bg-transparent border-0 p-0"
        >
          ‹ ALL FILMS
        </button>
        <button
          onClick={handleShare}
          className="font-sans text-[0.68rem] tracking-[0.14em] font-semibold text-ink2
                     hover:text-red transition-colors bg-transparent border-0 p-0"
        >
          {shareState === "copied" ? "LINK COPIED" : shareState === "failed" ? "COPY FAILED" : "COPY LINK"}
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
              priority
            />
          </div>
        </div>

        {/* Entry */}
        <div className="flex flex-col flex-1 min-w-0">
          <h1 className="font-display text-ink text-[1.9rem] sm:text-[2.9rem] font-bold leading-[1.02] m-0">
            {selected.title}
          </h1>

          {selected.genres && selected.genres.length > 0 && (
            <p className="font-mono text-[0.66rem] tracking-[0.12em] text-ink2 uppercase mt-3 mb-0">
              {selected.genres.join("  ·  ")}
            </p>
          )}

          {selected.overview && (
            <p className="text-ink2 text-[0.9rem] leading-[1.65] mt-4 mb-5 max-w-prose">
              {selected.overview}
            </p>
          )}

          {/* Particulars ledger */}
          <div className="border-t border-ink/25">
            <Particular label="Released">{fmtDate(selected.release_date)}</Particular>
            {(selected.runtime ?? 0) > 0 && (
              <Particular label="Runtime">{fmtRuntime(selected.runtime!)}</Particular>
            )}
            {selected.vote_average != null && (
              <Particular label="TMDB">
                <span className="font-mono tabular-nums">{selected.vote_average.toFixed(1)}</span>
                <span className="text-ink3"> / 10</span>
              </Particular>
            )}
            {selected.director && <Particular label="Directed by">{selected.director}</Particular>}
            {selected.cast && selected.cast.length > 0 && (
              <Particular label="Starring">{selected.cast.join(", ")}</Particular>
            )}
            {(selected.budget ?? 0) > 0 && (
              <Particular label="Budget">
                <span className="font-mono tabular-nums">{fmt(selected.budget!)}</span>
                <span className="text-ink3"> reported</span>
              </Particular>
            )}
          </div>

          {/* Action */}
          <div className="mt-6">
            {notReleased && (
              <div className="border-l-2 border-red pl-4 py-1">
                <p className="font-display text-ink text-[1.05rem] font-bold mb-1">Not yet in theaters</p>
                <p className="text-ink2 text-[0.83rem] leading-[1.55] m-0">
                  The ledger opens once the film releases and the box office starts reporting.
                </p>
              </div>
            )}

            {!notReleased && !prediction && !predicting && (
              <button
                onClick={onPredict}
                className="ledger-btn w-full font-sans font-bold text-[0.82rem] tracking-[0.18em] py-4"
              >
                RUN THE NUMBERS
              </button>
            )}

            {!notReleased && predicting && !prediction && (
              <div className="border border-ink/25 px-5 py-4">
                <p className="font-mono text-[0.68rem] tracking-[0.2em] text-ink mb-3">TOTTING UP…</p>
                <div className="relative h-1 bg-panel overflow-hidden">
                  <div
                    className="absolute inset-y-0 w-1/3 bg-red"
                    style={{ animation: "tapeScan 1.1s ease-in-out infinite" }}
                  />
                </div>
                <p className="font-sans text-[0.72rem] text-ink3 mt-3 m-0">
                  Modeling the weekend-by-weekend trajectory
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Prediction ledger */}
      {prediction && !prediction.error && (
        <div className="mt-11">
          <div data-ledger-rule className="rule-double mb-1" />
          <p data-ledger-label className="font-mono text-[0.6rem] tracking-[0.18em] text-ink3 uppercase mt-3 mb-5">
            The Prediction
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-l border-ink/20 mb-11">
            {[
              <StatCard key="ow" label="US Opening Weekend" value={fmt(prediction.opening_weekend)}
                countTo={prediction.opening_weekend} format={fmt} />,
              <StatCard key="pt" label="Predicted Worldwide" value={fmt(prediction.predicted_revenue)} highlight
                countTo={prediction.predicted_revenue} format={fmt} />,
              (() => {
                // decay_rate λ fits weekend gross ∝ e^(−λ·week), so each
                // weekend keeps e^(−λ) of the one before.
                const lam = prediction.decay_curve?.decay_rate;
                return lam != null ? (
                  <StatCard key="wd" label="Weekend Drop" value={`\u2212${Math.round((1 - Math.exp(-lam)) * 100)}%`}
                    note="Typical fall from one weekend to the next" />
                ) : (
                  <StatCard key="wd" label="Weekend Drop" value="—" note="Needs two weekends of figures" />
                );
              })(),
              (selected.budget ?? 0) > 0
                ? (() => {
                    const profit = estProfit(prediction.predicted_revenue, selected.budget!);
                    return (
                      <StatCard key="pf" label="Est. Profit" value={fmt(profit)} accent={profit < 0}
                        countTo={profit} format={fmt}
                        note={`Studio\u2019s ~half of the gross, minus the ${fmt(selected.budget!)} budget`} />
                    );
                  })()
                : <StatCard key="pf" label="Est. Profit" value="—" note="Budget not reported" />,
            ].map((cell, i) => (
              <div key={i} data-cell className="border-r border-b border-ink/20">
                {cell}
              </div>
            ))}
          </div>

          {(prediction.actual_revenue ?? 0) > 0 && (() => {
            const actual = prediction.actual_revenue!;
            const diff = prediction.predicted_revenue - actual;
            const over = diff > 0;
            return (
              <div data-ledger-follow className="border-l-2 border-ink pl-4 py-1 -mt-5 mb-11">
                <p className="font-mono text-[0.6rem] tracking-[0.18em] text-ink3 uppercase m-0 mb-1.5">
                  Run settled
                </p>
                <p className="text-ink text-[0.9rem] leading-[1.55] m-0">
                  Final worldwide gross{" "}
                  <span className="font-mono tabular-nums font-bold">{fmt(actual)}</span>
                  {" · "}
                  <span className={`font-mono tabular-nums font-bold ${over ? "text-red" : "text-ink"}`}>
                    {over ? "Over" : "Under"} {fmt(Math.abs(diff))}
                  </span>
                  <span className="text-ink3"> ({((Math.abs(diff) / actual) * 100).toFixed(1)}%)</span>
                </p>
              </div>
            );
          })()}

          {prediction.decay_curve && prediction.decay_curve.weeks.length > 2 && (
            <div data-ledger-follow>
              <div className="flex items-end justify-between mb-5">
                <h3 className="font-display text-ink text-[1.25rem] font-bold m-0">US Weekend Gross Decay</h3>
                <span className="font-mono text-[0.6rem] tracking-[0.12em] text-ink3 pb-1">$ MILLIONS</span>
              </div>
              <DecayCurve data={prediction.decay_curve} />
            </div>
          )}

          {prediction.decay_curve && prediction.decay_curve.weeks.length <= 2 && (
            <p className="text-ink2 text-[0.85rem] italic">
              Not enough weekends on the books yet — check back after a few more.
            </p>
          )}
        </div>
      )}

      {prediction?.error && (() => {
        const { title, body } = errorCopy(prediction.code, daysSinceRelease);
        return (
          <div role="alert" className="mt-8 border-l-2 border-red pl-4 py-1 max-w-prose">
            <p className="font-display text-ink text-[1.05rem] font-bold m-0 mb-1">{title}</p>
            <p className="text-ink2 text-[0.85rem] leading-[1.55] m-0">{body}</p>
            <div className="flex items-center gap-5 mt-3">
              <span className="font-mono text-[0.58rem] tracking-[0.14em] text-ink3 uppercase">
                Error · {prediction.code ?? "unknown"}
              </span>
              {RETRYABLE.has(prediction.code) && (
                <button
                  onClick={onPredict}
                  disabled={predicting}
                  className="font-sans text-[0.66rem] tracking-[0.14em] font-semibold text-red
                             bg-transparent border-0 p-0 hover:text-ink transition-colors disabled:opacity-50"
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
