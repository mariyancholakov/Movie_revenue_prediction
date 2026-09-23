'use client';
import { useState } from "react";
import Image from "next/image";
import type { Movie, Prediction } from "./types";
import { StatCard } from "./StatCard";
import { DecayCurve } from "./DecayCurve";

const fmt = (n: number) =>
  "$" + (n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : (n / 1e6).toFixed(1) + "M");

const fmtProfit = (n: number) => {
  const sign = n >= 0 ? "+" : "−";
  const abs = Math.abs(n);
  return sign + "$" + (abs >= 1e9 ? (abs / 1e9).toFixed(2) + "B" : (abs / 1e6).toFixed(1) + "M");
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
  const [copied, setCopied] = useState(false);
  // Capture "now" once at mount. Reading the clock during render is impure
  // (react-hooks/purity) and can drift between the server render and hydration;
  // these release-timing flags only need a single stable reading.
  const [now] = useState(() => Date.now());

  const releaseTime = selected.release_date ? new Date(selected.release_date).getTime() : NaN;
  const notReleased = !Number.isNaN(releaseTime) && releaseTime > now;
  const daysSinceRelease = Number.isNaN(releaseTime)
    ? Infinity
    : (now - releaseTime) / 86_400_000;
  const justOpened = daysSinceRelease >= 0 && daysSinceRelease < 10;

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="px-4 sm:px-8 lg:px-14 py-7 sm:py-10">
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
          {copied ? "LINK COPIED" : "COPY LINK"}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-7 sm:gap-10">
        {/* Poster plate */}
        <div className="shrink-0 mx-auto sm:mx-0">
          <div className="relative w-52 sm:w-60 md:w-72 aspect-[2/3] plate overflow-hidden bg-panel">
            <Image
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
        <div className="ledger-in mt-11">
          <div className="rule-double mb-1" />
          <p className="font-mono text-[0.6rem] tracking-[0.18em] text-ink3 uppercase mt-3 mb-5">
            The Prediction
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-l border-ink/20 mb-11">
            {[
              <StatCard key="ow" label="Opening Weekend" value={fmt(prediction.opening_weekend)}
                countTo={prediction.opening_weekend} format={fmt} />,
              <StatCard key="pt" label="Predicted Total" value={fmt(prediction.predicted_revenue)} highlight
                countTo={prediction.predicted_revenue} format={fmt} />,
              <StatCard key="dr" label="Decay Rate λ" value={prediction.decay_curve?.decay_rate ?? "N/A"} />,
              (selected.budget ?? 0) > 0
                ? (() => {
                    const profit = prediction.predicted_revenue - selected.budget!;
                    return (
                      <StatCard key="pf" label="Est. Profit" value={fmtProfit(profit)} accent={profit < 0} />
                    );
                  })()
                : <StatCard key="mult" label="Multiplier"
                    value={`${(prediction.predicted_revenue / Math.max(prediction.opening_weekend, 1)).toFixed(1)}×`} />,
            ].map((cell, i) => (
              <div key={i} className="border-r border-b border-ink/20">
                {cell}
              </div>
            ))}
          </div>

          {prediction.decay_curve && prediction.decay_curve.weeks.length > 2 && (
            <div>
              <div className="flex items-end justify-between mb-5">
                <h3 className="font-display text-ink text-[1.25rem] font-bold m-0">Weekend Gross Decay</h3>
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

      {prediction?.error && (
        <p className="text-red text-[0.85rem] mt-6 border-l-2 border-red pl-4 py-1">
          {justOpened
            ? "This film just opened — the box office usually reports within a few days. Check back soon."
            : "No box-office figures are on the books for this film yet."}
        </p>
      )}
    </section>
  );
}
