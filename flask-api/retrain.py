"""Retrain the box-office model on the seed dataset plus the finished-run labels
captured by /api/refresh-finished, and honestly measure whether the captured
data helps before touching production.

Method (avoids the "current model was trained on the whole seed set" trap):
  1. Hold out 20% of the SEED data as a test set neither candidate has seen.
  2. baseline  = XGBoost trained on seed-train only.
  3. augmented = XGBoost trained on seed-train + captured finished rows.
  4. Score both on the shared seed-test set (MAE / MAPE / R^2).
  5. Fit the final production artifact on ALL data (seed + captured).
  6. Only if --promote is passed AND augmented >= baseline on the holdout,
     back up the current model and swap in the new one.

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
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from supabase import create_client
from xgboost import XGBRegressor

load_dotenv()

MODELS_DIR = 'models'
SEED_CSV = 'data/movies_final.csv'
PROD_MODEL = f'{MODELS_DIR}/box_office_model_final.pkl'
FEATURES = joblib.load(f'{MODELS_DIR}/feature_columns_final.pkl')

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
        rows = sb.table('movies').select('title,features,actual_revenue') \
            .eq('is_in_theaters', False).execute().data or []
    except Exception as e:
        print(f"! could not load captured rows ({e}); training on seed only")
        return pd.DataFrame(columns=FEATURES + [LABEL])

    recs = []
    for r in rows:
        feats, y = r.get('features'), r.get('actual_revenue')
        if not feats or not y:
            continue
        rec = {c: feats.get(c, 0) for c in FEATURES}
        rec[LABEL] = y
        recs.append(rec)
    return pd.DataFrame(recs, columns=FEATURES + [LABEL])


def mape(y_true, y_pred):
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    return float(np.mean(np.abs(y_true - y_pred) / np.clip(np.abs(y_true), 1.0, None)) * 100)


def evaluate(model, X, y):
    p = model.predict(X)
    return {
        'mae': mean_absolute_error(y, p),
        'mape': mape(y, p),
        'r2': r2_score(y, p),
    }


def fit(X, y):
    model = XGBRegressor(**PARAMS)
    model.fit(X, y)
    return model


def fmt(m):
    return f"MAE ${m['mae']/1e6:8.2f}M | MAPE {m['mape']:6.1f}% | R2 {m['r2']:.4f}"


def run_retrain(promote=False):
    """Validate a seed+captured model against a seed-only baseline and, if
    `promote` and it wins the holdout, swap it into production (backing up first).
    Returns a summary dict. Importable by the scheduled capture job."""
    seed = pd.read_csv(SEED_CSV).dropna(subset=[LABEL])
    captured = load_captured()
    print(f"seed rows: {len(seed)} | captured finished rows: {len(captured)}\n")

    # 1. Shared holdout carved from the seed set only.
    seed_train, seed_test = train_test_split(seed, test_size=0.2, random_state=42)
    X_test, y_test = seed_test[FEATURES], seed_test[LABEL]

    # 2 + 3. Baseline vs augmented, both scored on the same unseen holdout.
    baseline = fit(seed_train[FEATURES], seed_train[LABEL])
    aug_train = pd.concat([seed_train[FEATURES + [LABEL]], captured], ignore_index=True) \
        if len(captured) else seed_train[FEATURES + [LABEL]]
    augmented = fit(aug_train[FEATURES], aug_train[LABEL])

    base_m = evaluate(baseline, X_test, y_test)
    aug_m = evaluate(augmented, X_test, y_test)

    print("Holdout comparison (seed test set, unseen by both):")
    print(f"  baseline  (seed only)      : {fmt(base_m)}")
    print(f"  augmented (seed + captured): {fmt(aug_m)}")
    delta = base_m['mae'] - aug_m['mae']
    wins = aug_m['mae'] <= base_m['mae']
    verb = 'better' if delta > 0 else ('same' if delta == 0 else 'worse')
    print(f"  -> augmented is {verb} by ${abs(delta)/1e6:.2f}M MAE\n")

    result = {
        'seed_rows': len(seed), 'captured_rows': len(captured),
        'baseline': base_m, 'augmented': aug_m, 'wins': bool(wins),
        'candidate_path': None, 'promoted': False, 'backup_path': None,
    }

    if len(captured) == 0:
        print("No captured rows yet — nothing to add. Collect finished runs first.")
        return result

    # 5. Final artifact: train on everything for maximum data.
    all_data = pd.concat([seed[FEATURES + [LABEL]], captured], ignore_index=True)
    final = fit(all_data[FEATURES], all_data[LABEL])

    ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    candidate_path = f'{MODELS_DIR}/candidate_{ts}.pkl'
    joblib.dump(final, candidate_path)
    result['candidate_path'] = candidate_path
    print(f"Saved candidate model -> {candidate_path}")

    if not promote:
        print("\nRead-only run. Re-run with --promote to swap it into production (only if it wins).")
        return result

    if not wins:
        print("\nNot promoting: augmented model did not beat baseline on the holdout.")
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
