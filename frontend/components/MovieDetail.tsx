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

interface MovieDetailProps {
  selected: Movie;
  prediction: Prediction | null;
  predicting: boolean;
  onBack: () => void;
  onPredict: () => void;
  fullPage?: boolean;
}

export function MovieDetail({
  selected,
  prediction,
  predicting,
  onBack,
  onPredict,
}: MovieDetailProps) {
  return (
    <section className="detail-panel px-16 py-12 relative">
      {selected && (
    <div className="absolute top-1/2 left-2/3 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-green/3 blur-[80px] -z-10 pointer-events-none" />
  )}
      <button
        onClick={onBack}
        className="flex items-center gap-2 px-4 py-2 mb-10 rounded-md border border-purple/80 hover:bg-purple/25 hover:border-purple hover:text-cream bg-purple/15 text-cream/80 text-xs tracking-[0.12em] font-medium transition-colors font-sans"
      >
        ← Back to all movies
      </button>

      <div className="flex gap-10">
        <div className="shrink-0 flex flex-col">
          <img
            src={selected.poster}
            alt={selected.title}
            className="w-80 flex-1 object-cover object-top rounded-md shadow-2xl shadow-green/5"
          />
        </div>

        <div className="flex flex-col flex-1 min-w-0">
          <h2 className="font-display text-4xl font-bold text-cream mb-2 leading-tight">
            {selected.title}
          </h2>

          <p className="text-pink text-sm mb-3 tracking-wide">
            {selected.release_date}
          </p>

          {selected.genres && selected.genres.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {selected.genres.map((g) => (
                <span
                  key={g}
                  className="text-[0.62rem] font-semibold tracking-[0.08em] text-green/70 bg-green/8 border border-green/15 rounded-full px-3 py-1 uppercase"
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          <p className="text-cream/70 text-sm leading-[1.7] mb-4">
            {selected.overview}
          </p>

          {selected.cast && selected.cast.length > 0 && (
            <p className="text-sm mb-3">
              <span className="text-cream/40 tracking-wide">Cast: </span>
              <span className="text-cream/70">{selected.cast.join(", ")}</span>
            </p>
          )}

          {(selected.budget ?? 0) > 0 && (
            <div className="inline-flex items-center gap-2 mb-6">
              <span className="text-cream/40 text-sm tracking-wide">Budget:</span>
              <span className="text-sm font-semibold font-sans tabular-nums text-cream/70 bg-purple/4 border border-purple/80 hover:border-purple rounded-full px-3 py-0.5">
                {fmt(selected.budget!)}
              </span>
            </div>
          )}
          {!prediction && !predicting && (
            <button
              onClick={onPredict}
              className="predict-btn w-full bg-green text-bg border-0 font-extrabold text-lg tracking-[0.12em] py-4 mt-4 rounded transition duration-300 ease-in-out"
            >
              Predict Revenue with AI
            </button>
          )}

          {predicting && !prediction && (
            <div className="flex items-center gap-6 py-2">
              <div className="relative w-13 h-13 shrink-0">
                <div
                  className="absolute inset-0 rounded-full border-[1.5px] border-green/12 border-t-green border-r-green/45"
                  style={{ animation: "spinArc 1.1s linear infinite" }}
                />
                <div
                  className="absolute inset-2.5 rounded-full border border-green/8 border-b-green border-l-green/30"
                  style={{ animation: "spinArc 0.75s linear infinite reverse" }}
                />
                <div
                  className="absolute inset-5 rounded-full border border-green/55"
                  style={{ animation: "pulseRing 2s ease-out infinite" }}
                />
                <div
                  className="absolute inset-5 rounded-full border border-green/55"
                  style={{ animation: "pulseRing 2s ease-out 1s infinite" }}
                />
              </div>
              <div>
                <span
                  className="block text-[0.72rem] tracking-[0.25em] text-green font-bold font-sans mb-1"
                  style={{ textShadow: "0 0 20px rgba(40,220,136,0.4)" }}
                >
                  ANALYZING...
                </span>
                <span className="text-[0.6rem] tracking-[0.15em] text-cream/28 font-sans">
                  MODELING BOX OFFICE TRAJECTORY
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Prediction results — full width below the poster+info row */}
      {prediction && !prediction.error && (
        <div className="mt-12">
          <div className="h-px bg-linear-to-r from-green/20 via-green/8 to-transparent mb-10" />

          <div className="flex divide-x divide-green/10 bg-white/1.5 rounded-xl border border-green/8 overflow-hidden mb-10">
            <StatCard label="OPENING WEEKEND" value={fmt(prediction.opening_weekend)} />
            <StatCard label="PREDICTED TOTAL" value={fmt(prediction.predicted_revenue)} highlight />
            <StatCard label="DECAY RATE λ" value={prediction.decay_curve?.decay_rate ?? "N/A"} accent />
            {(selected.budget ?? 0) > 0 && (() => {
              const profit = prediction.predicted_revenue - selected.budget!;
              return (
                <StatCard
                  label="EST. PROFIT"
                  value={fmtProfit(profit)}
                  highlight={profit >= 0}
                  accent={profit < 0}
                />
              );
            })()}
          </div>

          {prediction.decay_curve && prediction.decay_curve.weeks.length > 2 && (
            <div>
              <p className="text-cream/25 text-[0.62rem] tracking-[0.22em] mb-6 font-semibold uppercase">
                Weekend Gross Decay
              </p>
              <DecayCurve data={prediction.decay_curve} />
            </div>
          )}

          {prediction.decay_curve && prediction.decay_curve.weeks.length <= 2 && (
            <p className="text-cream/25 text-sm italic">
              Not enough weekly data yet — check back after a few more weekends.
            </p>
          )}
        </div>
      )}

      {prediction?.error && (
        <p className="text-pink text-sm mt-6">
          Could not fetch data for this movie. It may not have box office data yet.
        </p>
      )}
    </section>
  );
}
