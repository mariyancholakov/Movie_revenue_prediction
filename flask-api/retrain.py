"""Retrain the box-office model on the seed dataset plus the finished-run labels
captured by /api/refresh-finished, and honestly measure it against the current
approach before touching production.

Method:
  1. Hold out every seed film released in 2017 or later (~730 films) and train
     on the earlier ones. That is the job the model does in production:
     price films newer than anything it learned from. A random split would
     let it learn 2020s films' shorter runs from their neighbours.
  2. reference = the previous approach (XGBoost on log(revenue), the original
     26 features), trained on seed-train + captured rows.
  3. candidate = MultiplierModel (XGBoost on log(total / opening weekend),
     plus franchise and release-year features, without popularity), trained
     on the same rows. A seed-only candidate is reported too, to show what
     captured data adds.
  4. Score on the shared holdout (MAE / median APE / MAPE / R^2).
  5. Fit the final production artifact on ALL data (seed + captured).
  6. Only if --promote is passed AND the candidate is no worse than the
     reference on both MAE and median APE, back up the current model and swap
     in the new one.

Why a multiplier: the opening weekend already sets the scale of a run; the
other features mostly say how long it holds. Predicting total / opening lets
the model learn exactly that. On the 2017+ holdout it cuts MAE from $62M
to $54M and median APE from 39.9% to 37.6%.

Why no popularity: TMDB popularity in the seed data was measured years after
release (median 18.7), while live films are scored at release (median 83), so
the model reads every new film as unusually popular. The snapshots still keep
it, for a future model trained on at-release values.

Run read-only (default) to just see the numbers:
    ./venv/bin/python retrain.py
Promote a winner:
    ./venv/bin/python retrain.py --promote
"""
import argparse
import os
import shutil
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.compose import TransformedTargetRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from supabase import create_client
from xgboost import XGBRegressor

from model_lib import FRANCHISE_FEATURES, MultiplierModel, franchise_row
from scraper import get_franchise_features, get_movie_details

load_dotenv()

MODELS_DIR = 'models'
SEED_CSV = 'data/movies_final.csv'
PROD_MODEL = f'{MODELS_DIR}/box_office_model_final.pkl'
# The original 26 columns, which the reference approach uses.
BASE_FEATURES = joblib.load(f'{MODELS_DIR}/feature_columns_final.pkl')
FEATURES = [c for c in BASE_FEATURES if c != 'popularity'] + FRANCHISE_FEATURES
ALL_COLUMNS = BASE_FEATURES + FRANCHISE_FEATURES
HOLDOUT_FROM_YEAR = 2017

# Hyperparameters read off the existing production model so the retrain is faithful.
PARAMS = dict(
    n_estimators=500, max_depth=6, learning_rate=0.05,
    subsample=0.8, colsample_bytree=0.8,
    objective='reg:squarederror', random_state=42,
)
LABEL = 'revenue'


def load_captured():
    """Pull captured finished-run rows (features + real revenue) from Supabase."""
    try:
        sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_KEY'))
        rows = sb.table('movies').select('tmdb_id,title,features,actual_revenue') \
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
        rec[LABEL] = y
        recs.append(rec)
    return pd.DataFrame(recs, columns=ALL_COLUMNS + [LABEL])


def load_seed():
    """The seed CSV with the franchise and release-year columns derived the
    same way the API derives them (model_lib.franchise_row)."""
    seed = pd.read_csv(SEED_CSV).dropna(subset=[LABEL])
    derived = pd.DataFrame([
        franchise_row(r.release_date, r.collection_id, [], r.tmdb_id) for r in seed.itertuples()
    ], index=seed.index)
    # prior_parts was counted from the full collection by scripts/enrich_seed.py.
    derived['prior_parts'] = seed['prior_parts']
    derived['is_sequel'] = (seed['prior_parts'] > 0).astype(int)
    return pd.concat([seed.drop(columns=['prior_parts']), derived], axis=1)


def ape(y_true, y_pred):
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    return np.abs(y_true - y_pred) / np.clip(np.abs(y_true), 1.0, None) * 100


def evaluate(model, X, y, features):
    p = model.predict(X[features])
    errors = ape(y, p)
    return {
        'mae': mean_absolute_error(y, p),
        'median_ape': float(np.median(errors)),
        'mape': float(np.mean(errors)),
        'r2': r2_score(y, p),
    }


def fit_reference(X, y):
    """The previous production approach: XGBoost on log1p(revenue) over the
    original 26 features, predicting dollars."""
    model = TransformedTargetRegressor(
        regressor=XGBRegressor(**PARAMS), func=np.log1p, inverse_func=np.expm1,
    )
    return model.fit(X[BASE_FEATURES], y)


def fit(X, y):
    """The production approach: opening weekend x predicted multiplier."""
    return MultiplierModel(FEATURES, **PARAMS).fit(X, y)


def fmt(m):
    return (f"MAE ${m['mae']/1e6:7.2f}M | median APE {m['median_ape']:5.1f}% | "
            f"MAPE {m['mape']:6.1f}% | R2 {m['r2']:.4f}")


def run_retrain(promote=False):
    """Validate the multiplier candidate against the previous log-revenue
    approach and, if `promote` and it wins the holdout, swap it into production
    (backing up first). Returns a summary dict. Importable by the capture job."""
    seed = load_seed()
    captured = load_captured()
    print(f"seed rows: {len(seed)} | captured finished rows: {len(captured)}\n")

    # 1. Shared holdout: the seed films released from HOLDOUT_FROM_YEAR on.
    newer = seed['release_year'] >= HOLDOUT_FROM_YEAR
    seed_train, seed_test = seed[~newer], seed[newer]
    X_test, y_test = seed_test[ALL_COLUMNS], seed_test[LABEL]

    # 2 + 3. Reference (old approach) vs candidate, same training rows,
    # scored on the same unseen holdout.
    train = pd.concat([seed_train[ALL_COLUMNS + [LABEL]], captured], ignore_index=True) \
        if len(captured) else seed_train[ALL_COLUMNS + [LABEL]]
    reference_m = evaluate(fit_reference(train, train[LABEL]), X_test, y_test, BASE_FEATURES)
    seed_only_m = evaluate(fit(seed_train, seed_train[LABEL]), X_test, y_test, ALL_COLUMNS)
    candidate_m = evaluate(fit(train, train[LABEL]), X_test, y_test, ALL_COLUMNS)

    print(f"Holdout comparison (seed films from {HOLDOUT_FROM_YEAR}, n={len(seed_test)}, unseen by all):")
    print(f"  reference  log revenue, seed + captured : {fmt(reference_m)}")
    print(f"  candidate  multiplier,  seed only       : {fmt(seed_only_m)}")
    print(f"  candidate  multiplier,  seed + captured : {fmt(candidate_m)}")
    wins = (candidate_m['mae'] <= reference_m['mae']
            and candidate_m['median_ape'] <= reference_m['median_ape'])
    print(f"  -> candidate {'beats' if wins else 'does NOT beat'} the reference "
          f"(MAE {(reference_m['mae'] - candidate_m['mae'])/1e6:+.2f}M, "
          f"median APE {reference_m['median_ape'] - candidate_m['median_ape']:+.1f} pts better)\n")

    result = {
        'seed_rows': len(seed), 'captured_rows': len(captured),
        'reference': reference_m, 'seed_only': seed_only_m, 'candidate': candidate_m,
        'wins': bool(wins),
        'candidate_path': None, 'promoted': False, 'backup_path': None,
    }

    # 5. Final artifact: train on everything for maximum data.
    all_data = pd.concat([seed[ALL_COLUMNS + [LABEL]], captured], ignore_index=True)
    final = fit(all_data, all_data[LABEL])

    ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    candidate_path = f'{MODELS_DIR}/candidate_{ts}.pkl'
    joblib.dump(final, candidate_path)
    result['candidate_path'] = candidate_path
    print(f"Saved candidate model -> {candidate_path}")

    if not promote:
        print("\nRead-only run. Re-run with --promote to swap it into production (only if it wins).")
        return result

    if not wins:
        print("\nNot promoting: candidate did not beat the reference on the holdout.")
        return result

    backup = f'{MODELS_DIR}/box_office_model_backup_{ts}.pkl'
    shutil.copy(PROD_MODEL, backup)
    joblib.dump(final, PROD_MODEL)
    result['promoted'] = True
    result['backup_path'] = backup
    print(f"\nPROMOTED. Backed up previous model -> {backup}")
    print("Restart the Flask app to load the new model.")
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--promote', action='store_true',
                    help='overwrite the production model if the augmented model wins on the holdout')
    args = ap.parse_args()
    run_retrain(promote=args.promote)


if __name__ == '__main__':
    main()
