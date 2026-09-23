"""The box-office model and the features it shares between training and serving.

Kept in its own module because the pickled model artifact refers to
MultiplierModel by import path: retrain.py, app.py and the scheduled jobs must
all be able to import it as `model_lib.MultiplierModel`.
"""
from datetime import date

import numpy as np
import pandas as pd
from xgboost import DMatrix, XGBRegressor

# Added on top of the original 26 columns. release_year lets the model see
# that runs have got shorter (the typical total / opening fell from ~7.8x
# before 2017 to ~6.3x after 2020); the franchise flags separate sequels,
# which open big and fall fast, from originals.
FRANCHISE_FEATURES = ['in_collection', 'is_sequel', 'prior_parts', 'release_year']

# How explain() groups the features into lines a reader can follow. Every
# feature lands in exactly one group; the genre and season dummies are
# summed so a film reads "genre x1.10", not fourteen near-zero lines.
EXPLAIN_GROUPS = {
    'opening': lambda f: f == 'opening_weekend',
    'budget': lambda f: f == 'budget',
    'runtime': lambda f: f == 'runtime',
    'genre': lambda f: f.startswith('genre_'),
    'timing': lambda f: f == 'release_month' or f.startswith('release_season_'),
    'franchise': lambda f: f in ('in_collection', 'is_sequel', 'prior_parts'),
    'origin': lambda f: f in ('is_major_studio', 'is_us_production', 'is_english'),
    'era': lambda f: f == 'release_year',
}


def franchise_row(release_date, collection_id, collection_parts, tmdb_id=None):
    """The FRANCHISE_FEATURES for one film.

    `collection_parts` is the TMDB collection's [(tmdb_id, release_date), ...];
    prior_parts counts the ones released before this film. Used identically
    for the seed data (retrain.py) and for films in theaters (app.py)."""
    release_date = str(release_date or '')
    prior = sum(1 for pid, rd in (collection_parts or [])
                if rd and rd < release_date and pid != tmdb_id)
    try:
        year = date.fromisoformat(release_date).year
    except ValueError:
        year = 0
    return {
        'in_collection': int(collection_id is not None and not pd.isna(collection_id)),
        'is_sequel': int(prior > 0),
        'prior_parts': prior,
        'release_year': year,
    }


class MultiplierModel:
    """Predicts a film's total as opening weekend x a predicted multiplier.

    XGBoost learns log(total / opening weekend) rather than the total itself.
    The opening weekend already sets the scale of a run; what the other
    features really tell us is how long it holds, and that is what the
    multiplier measures. predict() returns dollars, like the previous models,
    so callers don't change.
    """

    def __init__(self, features, **params):
        if 'opening_weekend' not in features:
            raise ValueError('MultiplierModel needs opening_weekend as a feature')
        self.features = list(features)
        self.params = params
        self.regressor_ = None

    @staticmethod
    def _opening(X):
        return np.clip(np.asarray(X['opening_weekend'], dtype=float), 1.0, None)

    def fit(self, X, y):
        target = np.log(np.clip(np.asarray(y, dtype=float), 1.0, None) / self._opening(X))
        self.regressor_ = XGBRegressor(**self.params).fit(X[self.features], target)
        return self

    def predict(self, X):
        X = X.reindex(columns=self.features, fill_value=0)
        return np.exp(self.regressor_.predict(X[self.features])) * self._opening(X)

    def explain(self, X):
        """Break one film's predicted multiplier into factors.

        XGBoost's per-feature contributions (SHAP values) add up, in log
        space, to the predicted log multiplier. Exponentiated, they become
        factors that multiply: base x opening x budget x ... = multiplier.
        Returns (base, {group: factor}) for the first row of X."""
        X = X.reindex(columns=self.features, fill_value=0).astype(float)
        contribs = self.regressor_.get_booster().predict(DMatrix(X), pred_contribs=True)[0]
        by_feature = dict(zip(self.features, contribs[:-1]))
        factors = {
            group: float(np.exp(sum(v for f, v in by_feature.items() if belongs(f))))
            for group, belongs in EXPLAIN_GROUPS.items()
        }
        return float(np.exp(contribs[-1])), factors
