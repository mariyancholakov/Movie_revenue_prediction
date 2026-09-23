# MOVIEGROSS — The Box-Office Ledger

Predicts the **worldwide theatrical gross** of every film now playing, from an
XGBoost model trained on 5,000+ past releases. Every prediction is later
settled against the real result on **The Ledger**, so the model's track record
is public.

- **Now Playing** (`/`): current films, searchable by title and genre.
- **Movie page** (`/movie/<tmdb_id>`): run the numbers for a film. It shows
  the US opening weekend, predicted worldwide total, decay rate λ, and the US
  weekend-gross decay curve.
- **Rankings** (`/leaderboard`): priced films ranked by predicted total.
- **The Ledger** (`/finished`): settled runs, predicted vs. actual.

## How it works

```
TMDB (film data, worldwide revenue) ─┐
Box Office Mojo (US weekend grosses) ─┼─> Flask API ──> Supabase (prediction cache,
XGBoost model (models/*.pkl) ─────────┘      │           settled runs, weekly grosses)
                                             v
                                    Next.js frontend
```

- **Prediction:** TMDB details plus the Box Office Mojo opening weekend are
  turned into 26 features and fed to the model. The label is TMDB `revenue`
  (worldwide), while the opening weekend and decay curve are US domestic.
  Results are cached in Supabase for 7 days.
- **Settling:** a weekly job marks a film finished once it has left the
  now-playing list, is at least 12 weeks past release, and has a TMDB revenue
  figure. It stores that as the ground truth and keeps raising it as TMDB
  revises it.
- **Retraining** (`retrain.py`) trains on the seed set plus settled runs and
  compares it to a seed-only baseline on a shared holdout. Promotion is always
  deliberate.

## Repository

| Path | What |
|---|---|
| `flask-api/app.py` | API routes and the prediction / capture pipeline |
| `flask-api/scraper.py` | TMDB client and Box Office Mojo scraping + decay fit |
| `flask-api/warm_cache.py` | Pre-computes predictions for every now-playing film |
| `flask-api/capture_finished.py` | Settles finished runs (optionally retrains) |
| `flask-api/retrain.py` | Holdout-validated retraining; `--promote` to swap the model |
| `flask-api/migrations/` | SQL to run in the Supabase SQL editor, in order |
| `frontend/` | Next.js 16 app (App Router, Tailwind v4) |
| `.github/workflows/pipeline.yml` | Scheduled cache warming, capture, manual retrain |

## API

| Method | Path | |
|---|---|---|
| GET | `/health` | Liveness, model and DB status |
| GET | `/api/now-playing` | Current films (top 2 TMDB pages, re-releases removed) |
| GET | `/api/movie/<tmdb_id>` | One film's page data; 404 if unknown |
| POST | `/api/predict` | `{"tmdb_id": 123}` → prediction; errors carry a `code` |
| GET | `/api/leaderboard` | Priced now-playing films |
| GET | `/api/finished` | Settled runs with actual revenue |
| POST | `/api/refresh-finished` | Admin only: `Authorization: Bearer $ADMIN_TOKEN` |

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
2. **API** (any host that runs a Procfile, e.g. Render or Railway). Set the
   root directory to `flask-api`. The host reads `.python-version` and starts
   the app with `gunicorn` per the `Procfile`. Environment variables:
   `TMDB_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`,
   `ALLOWED_ORIGINS` (the frontend URL) and `ADMIN_TOKEN` (optional).
3. **Frontend** (e.g. Vercel). Set the root directory to `frontend` and set
   `NEXT_PUBLIC_API_URL` to the API origin. It's baked in at build time, and
   the build fails if it's missing.
4. **Scheduled jobs.** Add `TMDB_API_KEY`, `SUPABASE_URL` and `SUPABASE_KEY`
   as GitHub Actions secrets. The `data-pipeline` workflow then warms the
   cache daily and settles finished runs weekly. Once it's running, unload
   the old local launchd agent (`flask-api/scripts/`).
5. **Promoting a model.** Run the workflow's `retrain` job from the Actions
   tab. If the report shows the candidate winning on the holdout, commit the
   artifact as `flask-api/models/box_office_model_final.pkl` and redeploy the
   API.

## Data & attribution

Film data and posters come from [TMDB](https://www.themoviedb.org/). This
product uses the TMDB API but is not endorsed or certified by TMDB. Weekend
grosses come from Box Office Mojo. MOVIEGROSS is not affiliated with any
studio.
