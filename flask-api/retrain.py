"""Retrain the box-office model on the seed dataset plus the finished runs the
weekly capture job settled, and honestly measure it against the current
approach before touching production.

Method:
  1. Hold out every seed film released in 2017 or later (~1,100 films) and
     train on the earlier ones. That is the job the model does in production:
     price films newer than anything it learned from. A random split would
     let it learn 2020s films' shorter runs from their neighbours.
  2. reference = the previous approach, MultiplierModel (XGBoost on
     log(total / opening weekend) over TMDB features), trained on
     seed-train + captured rows with the cleaned worldwide label.
  3. candidate = RunModel (model_lib): US legs x worldwide/US ratio, with Box
     Office Mojo facts (theaters, MPAA, distributor, international market
     openings), director/cast track records, and one model pair per US
     weekend so the forecast tightens as a film plays. Trained on the same
     films, with the cleaned labels from dataset.py.
  4. Score both on the shared holdout against the cleaned worldwide label
     (dataset.clean_total, what the Ledger settles at): MAE / median APE / MAPE / R^2. The candidate is scored at stage 1,
     the opening-weekend forecast, which is the like-for-like comparison; the
     later stages are reported to show how the forecast tightens.
  5. Fit the final production artifact on ALL data (seed + captured).
  6. Only if --promote is passed AND the candidate is no worse than the
     reference on both MAE and median APE, back up the current model and swap
     in the new one.

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
HOLDOUT_FROM_YEAR = 2017

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


def run_retrain(promote=False):
    """Validate RunModel against the previous approach and, if `promote` and
    it wins the holdout, swap it into production (backing up first). Returns a
    summary dict. Importable by the capture job."""
    seed = dataset.load_seed_dataset()
    captured = enrich_captured(load_captured(), seed)
    print(f"seed rows: {len(seed)} (with Mojo US total: {seed['us_total'].notna().sum()}) "
          f"| captured finished rows: {len(captured)}\n")

    # 1. Shared holdout: the seed films released from HOLDOUT_FROM_YEAR on.
    newer = seed['release_year'] >= HOLDOUT_FROM_YEAR
    seed_train, test = seed[~newer], seed[newer]
    train = pd.concat([seed_train, captured], ignore_index=True)
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
    wins = (candidate_m['mae'] <= reference_m['mae']
            and candidate_m['median_ape'] <= reference_m['median_ape'])
    print(f"  -> candidate {'beats' if wins else 'does NOT beat'} the reference "
          f"(MAE {(reference_m['mae'] - candidate_m['mae'])/1e6:+.2f}M, "
          f"median APE {reference_m['median_ape'] - candidate_m['median_ape']:+.1f} pts better)\n")

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
        'wins': bool(wins),
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

    if not promote:
        print("\nRead-only run. Re-run with --promote to swap it into production (only if it wins).")
        return result

    if not wins:
        print("\nNot promoting: candidate did not beat the reference on the holdout.")
        return result

    backup = f'{MODELS_DIR}/box_office_model_backup_{ts}.pkl'
    shutil.copy(PROD_MODEL, backup)
    joblib.dump(final, PROD_MODEL)
    shutil.copy(ranges_path, ranges.RANGES_PATH)
    result['promoted'] = True
    result['backup_path'] = backup
    print(f"\nPROMOTED. Backed up previous model -> {backup}")
    print("Restart the Flask app to load the new model.")
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--promote', action='store_true',
                    help='overwrite the production model if the candidate wins on the holdout')
    args = ap.parse_args()
    run_retrain(promote=args.promote)


if __name__ == '__main__':
    main()
