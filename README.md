# MOVIEGROSS — The Box-Office Ledger

Predicts the **worldwide theatrical gross** of every film now playing, from an
XGBoost model trained on 5,000+ past releases. Every prediction is later
settled against the real result on **The Ledger**, so the model's track record
is public.

- **Now Playing** (`/`): films in US theaters, searchable by title and genre. Streaming premieres and releases outside the US are left out: the model predicts from the US opening weekend.
- **Movie page** (`/movie/<tmdb_id>`): run the numbers for a film. It shows
  the US opening weekend, predicted worldwide total, decay rate λ, and the US
  weekend-gross decay curve.
- **Rankings** (`/leaderboard`): priced films ranked by predicted total.
- **The Ledger** (`/finished`): settled runs, predicted vs. actual.
- **How It Works** (`/how-it-works`): the whole pipeline explained step by
  step (opening weekend, the features, the multiplier, the total, the decay
  curve, the Ledger, retraining and the model's limits), worked through with
  the real figures of any film now playing, picked from a menu.

## How it works

```
TMDB (film data, credits, revenue) ──┐
Box Office Mojo (US weekends, markets)┼─> Flask API ──> Supabase (prediction cache,
XGBoost model (models/*.pkl) ─────────┘      │           settled runs, weekly grosses)
                                             v
                                    Next.js frontend
```

- **Prediction:** `RunModel` (`model_lib.py`) splits the worldwide total
  into two questions: how long the film holds in the US (US total ÷ US gross
  so far) and how far it travels (worldwide ÷ US). It reads TMDB details
  (budget, runtime, genres, studio, release timing, franchise, release year),
  Box Office Mojo facts (opening theaters, MPAA rating, distributor, the
  international markets that have opened and their opening weekends),
  director and lead-cast track records (their earlier films only), and the
  US weekends so far. There is one model pair per stage, from the opening
  weekend to US weekend 8, so the forecast is redone as each weekend comes
  in; the live number never sits below the worldwide gross to date. Results
  are cached in Supabase; a film in theaters is re-scraped once each new US
  weekend is posted (Mondays; 7 days at most otherwise) and re-scored with
  the current model on every read.
- **Accuracy** (films from 2017 on, trained on earlier ones, vs the cleaned
  worldwide total): median miss 27% at the opening weekend (the previous
  model: 37%), 21% after US weekend 2, 16% after weekend 4, 13% after weekend 8.
- **Ranges:** `ranges.py` reads each call's likely range off the model's own
  misses on those unseen films, by US weekend and size of opening;
  `retrain.py` recalibrates it with every model it builds.
- **Explaining:** `/api/explain/<tmdb_id>` breaks a film's multiplier into
  factors for the How It Works page. XGBoost's per-feature contributions
  (SHAP values) add up to the log multiplier, so grouped (budget, genre,
  franchise, ...) and exponentiated they multiply back out to the prediction
  exactly: starting point × each factor = multiplier (`RunModel.explain`).
- **Tracking:** only a current release (at most 180 days since its US
  opening) is tracked as a run. Opening an older film's page caches its numbers but never puts it
  on the Ledger.
- **Settling:** a weekly job marks a film finished once it has left the
  now-playing list, is at least 12 weeks past release, and has a TMDB revenue
  figure. It stores that as the ground truth and keeps raising it as TMDB
  revises it. The Ledger scores the opening-weekend call, not the later
  re-forecasts, which end up close to the real total.
- **Retraining** (`retrain.py`) trains on the seed set plus settled runs and
  compares the candidate to the previous approach on seed films from 2017 on,
  trained only on earlier ones. Promotion is always deliberate. The label is
  Mojo's worldwide total where Mojo reports international grosses, else TMDB
  `revenue`, which sometimes holds only the US gross (`dataset.py`).

## Repository

| Path | What |
|---|---|
| `flask-api/app.py` | API routes and the prediction / capture pipeline |
| `flask-api/scraper.py` | TMDB client and Box Office Mojo scraping + decay fit |
| `flask-api/warm_cache.py` | Pre-computes predictions for every now-playing film |
| `flask-api/capture_finished.py` | Settles finished runs (optionally retrains) |
| `flask-api/model_lib.py` | The model classes, franchise features and track records shared by training and serving |
| `flask-api/mojo_parse.py` | Box Office Mojo page parsers shared by the API and the backfill |
| `flask-api/mojo_cache.py` | Mojo pages through a gzip cache (`data/mojo_cache/`, gitignored) |
| `flask-api/dataset.py` | Assembles the training set (seed + Mojo facts + credits + labels) |
| `flask-api/retrain.py` | Holdout-validated retraining; `--promote` to swap the model |
| `flask-api/scripts/scrape_mojo.py` | Scrapes Mojo for the seed films into `data/mojo*.csv` |
| `flask-api/scripts/fetch_credits.py` | TMDB directors and lead cast for the seed films |
| `flask-api/scripts/enrich_seed.py` | Adds TMDB release date and franchise columns to the seed CSV |
| `flask-api/migrations/` | SQL to run in the Supabase SQL editor, in order |
| `frontend/` | Next.js 16 app (App Router, Tailwind v4) |
| `.github/workflows/pipeline.yml` | Scheduled cache warming, capture, manual retrain |

## API

| Method | Path | |
|---|---|---|
| GET | `/health` | Liveness, model and DB status |
| GET | `/api/now-playing` | Films in US theaters (top 2 TMDB pages, kept only with a US theatrical release in the last 180 days) |
| GET | `/api/movie/<tmdb_id>` | One film's page data; 404 if unknown |
| POST | `/api/predict` | `{"tmdb_id": 123}` → prediction; errors carry a `code` |
| GET | `/api/leaderboard` | Priced now-playing films |
| GET | `/api/finished` | Settled runs with actual revenue |
| GET | `/api/explain/<tmdb_id>` | A priced film's feature snapshot and its multiplier split into factors (SHAP) |

Requests are rate-limited per visitor: 120 a minute overall, and 10 a minute
(100 an hour) for `/api/predict`, since a film not yet cached is scraped from
TMDB and Box Office Mojo. Over the limit, the API answers 429 with the code
`rate_limited`. `/health` is exempt.

## Local development

Requires Python 3.14 and Node 20+.

```bash
# API
cd flask-api
python3.14 -m venv venv && ./venv/bin/pip install -r requirements.txt
cp .env.example .env            # fill in TMDB + Supabase values
PORT=5001 ./venv/bin/python app.py

# Frontend (second terminal)
cd frontend
npm install
echo 'NEXT_PUBLIC_API_URL=http://127.0.0.1:5001' > .env.local
npm run dev                     # http://localhost:3000
```

On macOS, port 5000 is taken by the AirPlay Receiver, which is why the API
runs on 5001 here.

## Deploying

1. **Supabase.** In the dashboard, copy the **secret** key (`sb_secret_…`).
   Set it as the API's `SUPABASE_KEY` and deploy that change first. Then run
   `flask-api/migrations/` in order in the SQL editor. `002_enable_rls.sql`
   locks the tables to the secret key, so running it while the API still
   uses the publishable key breaks every request.
2. **API** (e.g. a Render web service). Set the root directory to
   `flask-api`; the host reads `.python-version`. Railway and Heroku read the
   start command from the `Procfile`; on Render, paste the `Procfile`'s
   `gunicorn …` line as the start command. Environment variables:
   `TMDB_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`,
   `ALLOWED_ORIGINS` (the frontend URL), `CLIENT_IP_HEADER=CF-Connecting-IP`
   (Render's Cloudflare edge; rate limits count each visitor by it).
3. **Frontend** (e.g. Vercel). Set the root directory to `frontend` and set
   `NEXT_PUBLIC_API_URL` to the API origin. It's baked in at build time, and
   the build fails if it's missing.
4. **Scheduled jobs.** Add `TMDB_API_KEY`, `SUPABASE_URL` and `SUPABASE_KEY`
   as GitHub Actions secrets. The `data-pipeline` workflow then warms the
   cache daily and settles finished runs weekly. Once it's running, unload
   the old local launchd agent (`flask-api/scripts/`).
5. **Promoting a model.** Run the workflow's `retrain` job from the Actions
   tab. If the report shows the candidate winning on the holdout, commit the
   artifact's model as `flask-api/models/box_office_model_final.pkl` and its
   `candidate_*_ranges.json` as `flask-api/models/forecast_ranges.json` (the
   ranges belong to the model they were read from), then redeploy the API.

## Data & attribution

Film data and posters come from [TMDB](https://www.themoviedb.org/). This
product uses the TMDB API but is not endorsed or certified by TMDB. Weekend
grosses come from Box Office Mojo. MOVIEGROSS is not affiliated with any
studio.
