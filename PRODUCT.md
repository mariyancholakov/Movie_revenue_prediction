# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing codebase. Frontend: Next.js 16 (App Router, Turbopack — note `frontend/AGENTS.md`: this Next version has breaking changes, consult `node_modules/next/dist/docs/` before touching framework APIs), React client components, Tailwind CSS v4 (`@import "tailwindcss"` + `@theme` tokens in `app/globals.css`). Backend: Flask API serving an ML box-office model (locally on `http://127.0.0.1:5001`, since macOS holds port 5000; deployed on Render, the frontend on Vercel); movie metadata and posters from TMDB, weekend grosses from Box Office Mojo.

## Users

Primary: film-curious visitors who want to see what a movie now in theaters will ultimately gross, and — because this is a **showcase for the ML model** — people evaluating the model and the maker's work (recruiters, ML-curious peers). Their job: pick a current film, get a credible predicted total, and judge whether to trust the model by seeing how it did on films whose runs have already finished.

## Product Purpose

MOVIEGROSS predicts the **worldwide theatrical box-office run** of any film currently playing, from a machine-learning model trained on 5,400 theatrical releases. A visitor browses now-playing films, opens one, and runs a prediction that returns the US opening weekend, the predicted worldwide total and its range, an estimated profit, a weekend-gross decay curve, and the forecast as it stood after each US weekend. Success = the visitor trusts the number, because the model's track record is shown openly.

## Positioning

Not a studio and not a box-office news site: a **model-driven predictor with a transparent accuracy ledger**. The differentiating mechanism is the accountability loop — every prediction is later settled against the real result on The Ledger (predicted vs. actual, signed difference), and current films are ranked by projected total on the Rankings page. The design's job is to make the *number* and the *track record* the hero, not decoration.

## Terminology & Constraints

- **Box-office vocabulary that must stay precise:** US opening weekend, predicted worldwide total, prediction range (where half of similar films finished), drop per weekend (from the decay rate λ), multiplier (predicted worldwide total ÷ US opening weekend), difference (actual − predicted; The Ledger headlines the median miss, as a percentage of the actual worldwide gross). Always say which figures are worldwide and which are US domestic.
- **Money formatting:** `$X.XM` and `$X.XXB`; the difference is signed and in the red when the film fell short. Est. profit is the studio's roughly half of the predicted gross minus the budget; marketing isn't in the reported budget.
- **Semantics of any accent color:** positive/hit/money vs. loss/over-budget/miss must remain visually distinguishable; do not use the negative hue for neutral data (e.g. decay rate is neutral).
- **Legal:** the disclaimer "PREDICTIONS FROM A MODEL TRAINED ON 5,000+ THEATRICAL RUNS · NOT AFFILIATED WITH ANY STUDIO" must remain.
- **Accessibility:** reduced-motion support is expected (already honored in CSS); keep it.
- **Data reality:** predictions require the film to have opened and have box-office data; unreleased films and just-opened films get explanatory states, not a number. Preserve these states.

## Surfaces

- **Now Playing** (`/`, `app/page.tsx`) — hero + search/genre filter + poster grid of current films.
- **Movie detail** (`/movie/[id]`) — poster, metadata, "Run the numbers" action, the prediction's figures, weekend decay curve, the forecast weekend by weekend, similar films.
- **Rankings** (`/leaderboard`) — priced films now playing, ranked by predicted total, with opening weekend and est. profit.
- **The Ledger** (`/finished`) — films whose runs ended, predicted vs. actual with the signed difference (the accuracy ledger).
- **How It Works** (`/how-it-works`) — the pipeline step by step, worked through with a film now playing.
