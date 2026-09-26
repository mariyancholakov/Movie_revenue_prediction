"""Retrain the box-office model on the seed dataset plus the finished runs the
weekly capture job settled, and honestly measure it against the current
approach before touching production.

Method:
  1. Hold out every seed film released in 2017 or later (~1,100 films) and
     train on the earlier ones. That is the job the model does in production:
     price films newer than anything it learned from. A random split would
     let it learn 2020s films' shorter runs from their neighbours.
  2. reference = the previous approach, MultiplierModel (XGBoost on
     log(total / opening weekend) over TMDB features), trained on the
     pre-2017 seed films with the cleaned worldwide label.
  3. candidate = RunModel (model_lib): US legs x worldwide/US ratio, with Box
     Office Mojo facts (theaters, MPAA, distributor, international market
     openings), director/cast track records, and one model pair per US
     weekend so the forecast tightens as a film plays. Trained on the same
     films, with the cleaned labels from dataset.py.
  4. Score both on the shared holdout against the cleaned worldwide label
     (dataset.clean_total, what the Ledger settles at): MAE / median APE / MAPE / R^2. The candidate is scored at stage 1,
     the opening-weekend forecast, which is the like-for-like comparison; the
     later stages are reported to show how the forecast tightens.
  5. Fit the final production artifact on ALL data (seed + captured). The
     captured runs join only here: they're newer than the holdout, and their
     track records read holdout outcomes, so in the exam they'd train a
     "pre-2017" model on the future.
  6. Only if --promote is passed AND the candidate's opening-weekend exam is
     no worse than the production model's (models/production_metrics.json,
     saved when it was promoted, within a small tolerance) on both MAE and
     median APE, back up the current model and swap in the new one. The
     production model itself can't sit the exam: its final fit saw the
     holdout films. The reference is printed for context only.

Needs data/mojo.csv, data/mojo_weekends.csv (scripts/scrape_mojo.py) and
data/credits.csv (scripts/fetch_credits.py). Captured films are looked up on
Box Office Mojo and TMDB here, through the same cache.

Run read-only (default) to just see the numbers:
    ./venv/bin/python retrain.py
Promote a winner:
    ./venv/bin/python retrain.py --promote
"""
import argparse
import json
import os
import shutil
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.metrics import mean_absolute_error, r2_score
from supabase import create_client

import dataset
import ranges
import mojo_cache
from model_lib import (FRANCHISE_FEATURES, MAX_STAGE, N_DISTRIBUTORS, MultiplierModel,
                       RunModel, credit_ids, reached, track_records)
from scraper import TMDB_API_KEY, _tmdb_get, get_franchise_features, get_movie_details

load_dotenv()

MODELS_DIR = 'models'
PROD_MODEL = f'{MODELS_DIR}/box_office_model_final.pkl'
# The original 26 columns.
BASE_FEATURES = joblib.load(f'{MODELS_DIR}/feature_columns_final.pkl')
FEATURES = [c for c in BASE_FEATURES if c != 'popularity'] + FRANCHISE_FEATURES
ALL_COLUMNS = BASE_FEATURES + FRANCHISE_FEATURES
PROD_METRICS = f'{MODELS_DIR}/production_metrics.json'
HOLDOUT_FROM_YEAR = 2017
# How much worse than production a candidate may score and still be
# promoted: the exam is deterministic, but a retrain on new data shouldn't be
# blocked by a rounding-sized wobble.
MAE_TOLERANCE = 0.02  # 2% of production's MAE
MEDIAN_APE_TOLERANCE = 0.5  # percentage points

# The reference's hyperparameters (the previous production model's).
PARAMS = dict(
    n_estimators=500, max_depth=6, learning_rate=0.05,
    subsample=0.8, colsample_bytree=0.8,
    objective='reg:squarederror', random_state=42,
)
# RunModel's: shallower trees and an absolute-error loss. Box-office labels
# have heavy tails (a limited release that expands 50x); squared error lets
# those few films pull every prediction around, absolute error doesn't.
RUN_PARAMS = dict(
    n_estimators=600, max_depth=4, learning_rate=0.03, min_child_weight=5,
    subsample=0.8, colsample_bytree=0.8,
    objective='reg:absoluteerror', random_state=42,
)
LABEL = 'revenue'  # a captured row's settled actual, cleaned again in add_mojo
TARGET = 'total'  # the cleaned worldwide label every model is fit and scored on


def load_captured():
    """Captured finished-run rows from Supabase: TMDB features + real revenue
    (+ imdb_id and release date, so retraining can look them up on Mojo)."""
    try:
        sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_KEY'))
        rows = sb.table('movies').select('tmdb_id,imdb_id,title,features,actual_revenue') \
            .eq('is_in_theaters', False).execute().data or []
    except Exception as e:
        print(f"! could not load captured rows ({e}); training on seed only")
        return pd.DataFrame(columns=ALL_COLUMNS + [LABEL])

    recs = []
    for r in rows:
        feats, y = r.get('features'), r.get('actual_revenue')
        if not feats or not y:
            continue
        if any(c not in feats for c in FRANCHISE_FEATURES):
            # Snapshot taken before these columns existed: look them up.
            try:
                feats = {**feats, **get_franchise_features(get_movie_details(r['tmdb_id']))}
            except ConnectionError as e:
                print(f"! skipping {r.get('title')}: {e}")
                continue
        rec = {c: feats.get(c, 0) for c in ALL_COLUMNS}
        rec.update({LABEL: y, 'tmdb_id': r['tmdb_id'], 'imdb_id': r.get('imdb_id'),
                    'title': r.get('title')})
        recs.append(rec)
    return pd.DataFrame(recs)


def enrich_captured(captured, seed):
    """Captured rows as full training rows: Mojo facts and weekly run (through
    the page cache), TMDB credits, labels, and track records against the seed
    history. Rows Mojo can't describe are dropped."""
    if captured.empty:
        return captured
    captured = captured[~captured['tmdb_id'].isin(seed['tmdb_id'])].copy()
    facts, weeks, credits, dates = [], {}, [], []
    for r in captured.itertuples():
        try:
            mojo_cache.fetch_film(r.imdb_id)
        except ConnectionError as e:
            print(f"! Mojo unavailable for {r.title}: {e}")
        row, wk = mojo_cache.parse_film(r.tmdb_id, r.imdb_id)
        facts.append(row)
        if wk is not None:
            weeks[r.tmdb_id] = wk[dataset.WEEK_COLUMNS].to_dict('records')
        data = _tmdb_get(f"https://api.themoviedb.org/3/movie/{r.tmdb_id}/credits?api_key={TMDB_API_KEY}")
        directors, cast = credit_ids(data) if data else ('', '')
        credits.append({'tmdb_id': r.tmdb_id, 'director_ids': directors, 'cast_ids': cast})
        us = row.get('us_release')
        dates.append(us.date().isoformat() if isinstance(us, pd.Timestamp) and not pd.isna(us) else None)
    captured['release_date'] = dates
    d = captured.merge(pd.DataFrame(credits), on='tmdb_id', how='left')
    d = dataset.add_mojo(d, pd.DataFrame(facts))
    d = pd.concat([d, track_records(d, pd.concat([seed, d], ignore_index=True))], axis=1)
    d['weeks'] = [weeks.get(t, []) for t in d['tmdb_id']]
    return d.dropna(subset=['us_total'])


def ape(y_true, y_pred):
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    return np.abs(y_true - y_pred) / np.clip(np.abs(y_true), 1.0, None) * 100


def metrics(y, p):
    errors = ape(y, p)
    return {
        'mae': mean_absolute_error(y, p),
        'median_ape': float(np.median(errors)),
        'mape': float(np.mean(errors)),
        'r2': r2_score(y, p),
    }


def fit_reference(d):
    """The previous production approach: opening weekend x multiplier."""
    return MultiplierModel(FEATURES, **PARAMS).fit(d, d[TARGET])


def fit(d):
    """The production approach: RunModel on films with a Mojo US total."""
    d = d.dropna(subset=['us_total'])
    distributors = d['distributor'].value_counts().index[:N_DISTRIBUTORS].tolist()
    model = RunModel(FEATURES, RUN_PARAMS, distributors)
    return model.fit(dataset.raw_rows(d), d['us_total'].values, d['total'].values)


def fmt(m):
    return (f"MAE ${m['mae']/1e6:7.2f}M | median APE {m['median_ape']:5.1f}% | "
            f"MAPE {m['mape']:6.1f}% | R2 {m['r2']:.4f}")


def load_production_metrics():
    """The exam the production model passed when it was promoted, or None."""
    try:
        with open(PROD_METRICS) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def beats_production(candidate_m, production):
    """Whether the candidate's stage-1 exam is no worse than production's,
    within the tolerances."""
    prod = production['candidate']
    return (candidate_m['mae'] <= prod['mae'] * (1 + MAE_TOLERANCE)
            and candidate_m['median_ape'] <= prod['median_ape'] + MEDIAN_APE_TOLERANCE)


def run_retrain(promote=False):
    """Validate RunModel against the production model's exam and, if
    `promote` and it holds up, swap it into production (backing up first).
    Returns a summary dict."""
    seed = dataset.load_seed_dataset()
    captured = enrich_captured(load_captured(), seed)
    print(f"seed rows: {len(seed)} (with Mojo US total: {seed['us_total'].notna().sum()}) "
          f"| captured finished rows: {len(captured)}\n")

    # 1. Shared holdout: the seed films released from HOLDOUT_FROM_YEAR on,
    # priced by models trained only on the films before (step 5).
    newer = seed['release_year'] >= HOLDOUT_FROM_YEAR
    train, test = seed[~newer], seed[newer]
    y_test = test[TARGET].values

    # 2 + 3. Reference vs candidate, same training films, same unseen holdout.
    reference = fit_reference(train)
    candidate = fit(train)
    raws = dataset.raw_rows(test)
    reference_m = metrics(y_test, reference.predict(test[ALL_COLUMNS]))
    candidate_m = metrics(y_test, candidate.predict(raws, stage=1))

    print(f"Holdout (seed films from {HOLDOUT_FROM_YEAR}, n={len(test)}, unseen by both), vs the cleaned worldwide label:")
    print(f"  reference  opening x multiplier      : {fmt(reference_m)}")
    print(f"  candidate  RunModel, opening weekend : {fmt(candidate_m)}")
    print(f"  -> vs the reference: MAE {(reference_m['mae'] - candidate_m['mae'])/1e6:+.2f}M, "
          f"median APE {reference_m['median_ape'] - candidate_m['median_ape']:+.1f} pts better")
    production = load_production_metrics()
    if production is None:
        wins = False
        print(f"  -> no {PROD_METRICS}: can't compare with the production model\n")
    else:
        wins = beats_production(candidate_m, production)
        prod = production['candidate']
        print(f"  production (promoted {production.get('promoted_at', '?')}): {fmt(prod)}")
        print(f"  -> candidate {'holds up against' if wins else 'is WORSE than'} production "
              f"(MAE {(prod['mae'] - candidate_m['mae'])/1e6:+.2f}M, "
              f"median APE {prod['median_ape'] - candidate_m['median_ape']:+.1f} pts better; "
              f"tolerance {MAE_TOLERANCE:.0%} / {MEDIAN_APE_TOLERANCE} pts)\n")

    print("  RunModel as the run plays (films still in release after k US weekends):")
    stages = {}
    for k in range(1, MAX_STAGE + 1):
        idx = [i for i, r in enumerate(raws) if reached(r, k)]
        m = metrics(y_test[idx], candidate.predict([raws[i] for i in idx], stage=k))
        stages[k] = m
        print(f"    after weekend {k} (n={len(idx):4d}) : {fmt(m)}")
    print()

    result = {
        'seed_rows': len(seed), 'captured_rows': len(captured),
        'reference': reference_m, 'candidate': candidate_m, 'stages': stages,
        'wins': bool(wins), 'holdout_n': len(test),
        'candidate_path': None, 'promoted': False, 'backup_path': None,
    }

    # 5. Final artifact: train on everything for maximum data.
    final = fit(pd.concat([seed, captured], ignore_index=True))

    ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    candidate_path = f'{MODELS_DIR}/candidate_{ts}.pkl'
    joblib.dump(final, candidate_path)
    result['candidate_path'] = candidate_path
    print(f"Saved candidate model -> {candidate_path}")
    # Its forecast ranges, read off the holdout calls of the same approach.
    ranges_path = candidate_path.replace('.pkl', '_ranges.json')
    with open(ranges_path, 'w') as f:
        json.dump(ranges.calibrate(candidate, test), f, indent=1)
    # Its exam: the bar the next candidate must clear if this one is promoted.
    metrics_path = candidate_path.replace('.pkl', '_metrics.json')
    save_metrics(result, ts, metrics_path)

    if not promote:
        print("\nRead-only run. Re-run with --promote to swap it into production (only if it wins).")
        return result

    if not wins:
        print("\nNot promoting: candidate did not hold up against the production model's exam.")
        return result

    backup = f'{MODELS_DIR}/box_office_model_backup_{ts}.pkl'
    shutil.copy(PROD_MODEL, backup)
    joblib.dump(final, PROD_MODEL)
    shutil.copy(ranges_path, ranges.RANGES_PATH)
    shutil.copy(metrics_path, PROD_METRICS)
    result['promoted'] = True
    result['backup_path'] = backup
    print(f"\nPROMOTED. Backed up previous model -> {backup}")
    print("Commit models/box_office_model_final.pkl, models/forecast_ranges.json and "
          "models/production_metrics.json, "
          "then redeploy the API (or restart it locally) to load the new model.")
    return result


def save_metrics(result, ts, path):
    """Write a candidate's exam (as models/production_metrics.json once promoted)."""
    keep = {k: result[k] for k in ('seed_rows', 'captured_rows', 'holdout_n', 'reference', 'candidate', 'stages')}
    keep['promoted_at'] = ts
    with open(path, 'w') as f:
        json.dump(keep, f, indent=1, default=float)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--promote', action='store_true',
                    help="overwrite the production model if the candidate's holdout exam is no worse than production's")
    args = ap.parse_args()
    run_retrain(promote=args.promote)


if __name__ == '__main__':
    main()
