"""Forecast ranges: how far a call can land from the final total.

A range is read off the model's own record, not assumed. A RunModel trained
only on films before retrain.HOLDOUT_FROM_YEAR prices the ~1,100 films released
since, and for each stage (US weekends reported, 1..MAX_STAGE) and size of
opening we keep the spread of log(final / call). The range for a new call is
that call times the 10th and 90th percentiles of its group: eight in ten films
like it finished inside.

    python ranges.py   # recalibrate and write models/forecast_ranges.json
"""
import json
import os

import numpy as np

import dataset
from model_lib import MAX_STAGE

RANGES_PATH = os.path.join(os.path.dirname(__file__), 'models', 'forecast_ranges.json')
QUANTILES = (0.1, 0.9)
# US opening sizes: a small release can grow many times over or vanish, a
# big one is pinned down far better.
OPENING_BINS = [0, 1e6, 4e6, 10e6, 30e6]
MIN_FILMS = 30  # a thinner group borrows the previous stage's spread


def opening_bin(opening):
    return int(np.searchsorted(OPENING_BINS, opening or 0, side='right') - 1)


def calibrate(model, test):
    """Spreads of log(final / call) on `test` (films `model` never saw),
    per stage and opening bin. Returns the JSON-ready calibration."""
    raws = dataset.raw_rows(test)
    final = test['total'].values
    bins = np.array([opening_bin(o) for o in test['opening_weekend']])
    stages, prev = {}, None
    for k in range(1, MAX_STAGE + 1):
        idx = np.array([i for i, r in enumerate(raws) if k == 1 or len(r['weeks'] or []) >= k])
        calls = model.predict([raws[i] for i in idx], stage=k)
        ok = np.isfinite(final[idx]) & (final[idx] > 0) & (calls > 0)
        resid = np.log(final[idx][ok] / calls[ok])
        spread = lambda r: [round(float(q), 4) for q in np.quantile(r, QUANTILES)] + [int(len(r))]
        rows = []
        for b in range(len(OPENING_BINS)):
            r = resid[bins[idx][ok] == b]
            rows.append(spread(r) if len(r) >= MIN_FILMS else prev[b] if prev else spread(resid))
        stages[str(k)] = prev = rows
    return {'quantiles': list(QUANTILES), 'opening_bins': OPENING_BINS, 'stages': stages}


def load():
    try:
        with open(RANGES_PATH) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def forecast_range(cal, call, stage, opening):
    """(low, high) around `call` for a film at `stage` with this US opening,
    or None without a calibration."""
    if not cal or not call:
        return None
    k = str(min(max(int(stage or 1), 1), MAX_STAGE))
    lo, hi, _ = cal['stages'][k][opening_bin(opening)]
    return round(call * np.exp(lo)), round(call * np.exp(hi))


def main():
    import retrain as R
    seed = dataset.load_seed_dataset()
    newer = seed['release_year'] >= R.HOLDOUT_FROM_YEAR
    cal = calibrate(R.fit(seed[~newer]), seed[newer])
    with open(RANGES_PATH, 'w') as f:
        json.dump(cal, f, indent=1)
    print(f'wrote {RANGES_PATH}')
    for k in ('1', '4', '8'):
        print(f'stage {k}:', [f'x{np.exp(lo):.2f}-x{np.exp(hi):.2f} (n={n})' for lo, hi, n in cal['stages'][k]])


if __name__ == '__main__':
    main()
