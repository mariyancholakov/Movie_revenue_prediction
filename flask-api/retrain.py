"""Retrain the box-office model on the seed dataset plus the finished-run labels
captured by /api/refresh-finished, and honestly measure it against the current
approach before touching production.

Method (avoids the "current model was trained on the whole seed set" trap):
  1. Hold out 20% of the SEED data as a test set no candidate has seen.
  2. reference = the previous approach (XGBoost on raw dollars), trained on
     seed-train + captured rows.
  3. candidate = XGBoost on log(revenue), trained on the same rows.
     (seed-only candidate is reported too, to show what captured data adds.)
  4. Score on the shared seed-test set (MAE / median APE / MAPE / R^2).
  5. Fit the final production artifact on ALL data (seed + captured).
  6. Only if --promote is passed AND the candidate is no worse than the
     reference on both MAE and median APE, back up the current model and swap
     in the new one.

Why log(revenue): on raw dollars, squared error is dominated by blockbusters,
so a $5M miss on a small film costs the model nothing and it overshoots small
releases by 10-60x. On the log scale errors count in proportion, so small and
large films are weighted alike. The artifact is a TransformedTargetRegressor,
whose predict() returns dollars, so the API needs no change.

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


def ape(y_true, y_pred):
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    return np.abs(y_true - y_pred) / np.clip(np.abs(y_true), 1.0, None) * 100


def evaluate(model, X, y):
    p = model.predict(X)
    errors = ape(y, p)
    return {
        'mae': mean_absolute_error(y, p),
        'median_ape': float(np.median(errors)),
        'mape': float(np.mean(errors)),
        'r2': r2_score(y, p),
    }


def fit_raw(X, y):
    """The previous production approach: XGBoost on raw dollars."""
    return XGBRegressor(**PARAMS).fit(X, y)


def fit(X, y):
    """The production approach: XGBoost on log1p(revenue), predicting dollars."""
    model = TransformedTargetRegressor(
        regressor=XGBRegressor(**PARAMS), func=np.log1p, inverse_func=np.expm1,
    )
    return model.fit(X, y)


def fmt(m):
    return (f"MAE ${m['mae']/1e6:7.2f}M | median APE {m['median_ape']:5.1f}% | "
            f"MAPE {m['mape']:6.1f}% | R2 {m['r2']:.4f}")


def run_retrain(promote=False):
    """Validate the log-target candidate against the previous raw-dollar
    approach and, if `promote` and it wins the holdout, swap it into production
    (backing up first). Returns a summary dict. Importable by the capture job."""
    seed = pd.read_csv(SEED_CSV).dropna(subset=[LABEL])
    captured = load_captured()
    print(f"seed rows: {len(seed)} | captured finished rows: {len(captured)}\n")

    # 1. Shared holdout carved from the seed set only.
    seed_train, seed_test = train_test_split(seed, test_size=0.2, random_state=42)
    X_test, y_test = seed_test[FEATURES], seed_test[LABEL]

    # 2 + 3. Reference (old approach) vs candidate, same training rows,
    # scored on the same unseen holdout.
    train = pd.concat([seed_train[FEATURES + [LABEL]], captured], ignore_index=True) \
        if len(captured) else seed_train[FEATURES + [LABEL]]
    reference_m = evaluate(fit_raw(train[FEATURES], train[LABEL]), X_test, y_test)
    seed_only_m = evaluate(fit(seed_train[FEATURES], seed_train[LABEL]), X_test, y_test)
    candidate_m = evaluate(fit(train[FEATURES], train[LABEL]), X_test, y_test)

    print(f"Holdout comparison (seed test set, n={len(seed_test)}, unseen by all):")
    print(f"  reference  raw $, seed + captured : {fmt(reference_m)}")
    print(f"  candidate  log,   seed only       : {fmt(seed_only_m)}")
    print(f"  candidate  log,   seed + captured : {fmt(candidate_m)}")
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
