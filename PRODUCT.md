# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing codebase. Frontend: Next.js 16 (App Router, Turbopack — note `frontend/AGENTS.md`: this Next version has breaking changes, consult `node_modules/next/dist/docs/` before touching framework APIs), React client components, Tailwind CSS v4 (`@import "tailwindcss"` + `@theme` tokens in `app/globals.css`). Backend: Flask API on `http://127.0.0.1:5000` serving an ML box-office model; movie metadata and posters from TMDB.

## Users

Primary: film-curious visitors who want to see what a movie now in theaters will ultimately gross, and — because this is a **showcase for the ML model** — people evaluating the model and the maker's work (recruiters, ML-curious peers). Their job: pick a current film, get a credible predicted total, and judge whether to trust the model by seeing how it did on films whose runs have already finished.

## Product Purpose

MOVIEGROSS predicts the **total theatrical box-office run** of any film currently playing, from a machine-learning model trained on 5,000+ theatrical releases. A visitor browses now-playing films, opens one, and runs a prediction that returns the opening weekend, the predicted lifetime total, a decay rate (λ), and a weekend-gross decay curve. Success = the visitor trusts the number, because the model's track record is shown openly.

## Positioning

Not a studio and not a box-office news site: a **model-driven predictor with a transparent accuracy ledger**. The differentiating mechanism is the accountability loop — every prediction is later settled against the real result on the Finished page (predicted vs. actual, signed error), and current films are ranked by projected total on the Rankings page. The design's job is to make the *number* and the *track record* the hero, not decoration.

## Terminology & Constraints

- **Box-office vocabulary that must stay precise:** opening weekend, predicted total, decay rate λ, multiplier (predicted total ÷ opening weekend), error / over / under (Finished page uses standard MAPE against actual).
- **Money formatting:** `$X.XM` and `$X.XXB`; profit/error shown signed (`+`/`−`, "Over"/"Under").
- **Semantics of any accent color:** positive/hit/money vs. loss/over-budget/miss must remain visually distinguishable; do not use the negative hue for neutral data (e.g. decay rate is neutral).
- **Legal:** the disclaimer "PREDICTIONS FROM A MODEL TRAINED ON 5,000+ THEATRICAL RUNS · NOT AFFILIATED WITH ANY STUDIO" must remain.
- **Accessibility:** reduced-motion support is expected (already honored in CSS); keep it.
- **Data reality:** predictions require the film to have opened and have box-office data; unreleased films and just-opened films get explanatory states, not a number. Preserve these states.

## Surfaces

- **Now Playing** (`/`, `app/page.tsx`) — hero + search/genre filter + poster grid of current films.
- **Movie detail** (`/movie/[id]`) — poster, metadata, "Predict Revenue" action, result stats, weekend decay curve, similar films.
- **Rankings** (`/leaderboard`) — current films ranked by predicted total, with opening weekend and multiplier.
- **Finished** (`/finished`) — films whose runs ended, predicted vs. actual with signed error (the accuracy ledger).
