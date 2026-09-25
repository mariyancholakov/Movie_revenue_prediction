"""The box-office model and the features it shares between training and serving.

Kept in its own module because a pickled model refers to its class by import
path: the production artifact is `model_lib.RunModel` (older ones and
retrain.py's reference are `model_lib.MultiplierModel`), so app.py, retrain.py
and the scheduled jobs must all import them from here. Only the class is
pickled, not its methods, so changing a method changes the loaded model too.
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


TOP_CAST = 3  # billed cast counted as a film's leads


def credit_ids(credits):
    """('|'-joined director ids, '|'-joined top-billed cast ids) from a TMDB
    /credits response. Used identically for the seed data and live films."""
    directors = [str(c['id']) for c in credits.get('crew', []) if c.get('job') == 'Director']
    cast = [str(c['id']) for c in sorted(credits.get('cast', []), key=lambda c: c.get('order', 99))[:TOP_CAST]]
    return '|'.join(directors), '|'.join(cast)


TRACK_FEATURES = ['dir_prior_n', 'dir_prior_log_mult', 'dir_prior_log_total',
                  'cast_prior_n', 'cast_prior_log_mult', 'cast_prior_log_total']
# A prior film only counts once its run is over, as it would be when scoring
# live: released at least this long before the film being scored.
SETTLED_DAYS = 120


def track_records(films, history):
    """Leak-free director and lead-cast track records.

    `films`: rows with release_date, director_ids, cast_ids.
    `history`: rows with the same columns plus total (worldwide) and
    opening_weekend, the films whose outcomes are known.
    For each film, averages log(total / opening) and log(total) over the
    history films by the same director(s) / lead cast that were released at
    least SETTLED_DAYS earlier. NaN when there are none (XGBoost learns what
    'no track record' means)."""
    hist = history.dropna(subset=['release_date']).copy()
    hist['date'] = pd.to_datetime(hist['release_date'], errors='coerce')
    hist = hist.dropna(subset=['date'])
    hist['log_mult'] = np.log(np.clip(hist['total'], 1, None) / np.clip(hist['opening_weekend'], 1, None))
    hist['log_total'] = np.log(np.clip(hist['total'], 1, None))

    def index(col):
        by_person = {}
        for date_, ids, lm, lt in zip(hist['date'], hist[col], hist['log_mult'], hist['log_total']):
            for pid in str(ids or '').split('|'):
                if pid and pid != 'nan':
                    by_person.setdefault(pid, []).append((date_, lm, lt))
        return by_person

    people = {'dir': index('director_ids'), 'cast': index('cast_ids')}
    rows = []
    for r in films.itertuples():
        cutoff = pd.to_datetime(getattr(r, 'release_date', None), errors='coerce')
        out = {}
        for key, col in (('dir', 'director_ids'), ('cast', 'cast_ids')):
            prior = []
            if not pd.isna(cutoff):
                cutoff_s = cutoff - pd.Timedelta(days=SETTLED_DAYS)
                for pid in str(getattr(r, col, '') or '').split('|'):
                    prior += [(lm, lt) for d, lm, lt in people[key].get(pid, []) if d <= cutoff_s]
            out[f'{key}_prior_n'] = len(prior)
            out[f'{key}_prior_log_mult'] = float(np.mean([p[0] for p in prior])) if prior else np.nan
            out[f'{key}_prior_log_total'] = float(np.mean([p[1] for p in prior])) if prior else np.nan
        rows.append(out)
    return pd.DataFrame(rows, index=films.index, columns=TRACK_FEATURES)


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


# ── RunModel ─────────────────────────────────────────────────────────────────
# Box Office Mojo facts a film's snapshot carries on top of SNAPSHOT_COLUMNS:
# opening theaters, MPAA rating, distributor, and international market
# openings known by the end of each US weekend (intl_open_w1..w8,
# intl_markets_w1..w8). `weeks` holds the US weekends reported so far.
MAX_STAGE = 8  # after 8 US weekends a run's total is essentially known
MPAA_RATINGS = ['G', 'PG', 'PG-13', 'R']
STREAMERS = ('Netflix', 'Amazon', 'Apple')
N_DISTRIBUTORS = 15
# The snapshot keys RunModel reads besides the TMDB features and `weeks`.
RUN_FACTS = (['open_theaters', 'mpaa', 'distributor']
             + [f'intl_open_w{k}' for k in range(1, MAX_STAGE + 1)]
             + [f'intl_markets_w{k}' for k in range(1, MAX_STAGE + 1)]
             + TRACK_FEATURES)

RUN_EXPLAIN_GROUPS = {
    **EXPLAIN_GROUPS,
    'opening': lambda f: f in ('opening_weekend', 'log_open_theaters', 'per_theater'),
    'origin': lambda f: f in ('is_major_studio', 'is_us_production', 'is_english',
                              'dist_code', 'is_streamer'),
    'rating': lambda f: f.startswith('mpaa_'),
    'talent': lambda f: f in TRACK_FEATURES,
    'abroad': lambda f: f in ('log_intl_open', 'intl_markets'),
    'run': lambda f: f.startswith('run_'),
}


def _num(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return np.nan
    return v


def run_weeks(raw):
    """The US weekends in a snapshot, one per weekend number. Box Office Mojo
    repeats a number for holiday long weekends; mojo_parse.weekend_table
    keeps the first of each, as training did, but snapshots stored before it
    did still carry the repeats."""
    weeks = raw.get('weeks') if isinstance(raw.get('weeks'), (list, tuple)) else []
    seen, out = set(), []
    for w in weeks:
        if w.get('week') not in seen:
            seen.add(w.get('week'))
            out.append(w)
    return out


def reached(raw, stage):
    """Whether a film's run has the weekends a `stage` forecast reads (every
    film has stage 1, the opening-weekend call)."""
    return stage == 1 or len(run_weeks(raw)) >= stage


def stage_of(raw):
    """How many US weekends a film's forecast can use (1 = opening weekend)."""
    return int(min(max(len(run_weeks(raw)), 1), MAX_STAGE))


class RunModel:
    """Worldwide total = US gross so far x US legs x worldwide/US ratio.

    Two XGBoost models per stage k (the number of US weekends reported,
    1..MAX_STAGE):
      us     log(US total / US gross to date after weekend k)
      ratio  log(worldwide total / US total)
    Stage 1 is the opening-weekend forecast; each later stage re-forecasts
    with the run so far, so the number tightens as a film plays. The US legs
    and the international share are different questions, and international
    market openings answer the second one far better than anything US-side.

    predict() takes raw snapshot rows (the columns above, strings and a
    `weeks` list included) and derives every model input itself, so the
    seed backfill and a film priced live go through the same code.
    A live snapshot may also carry `ww_to_date`, the worldwide gross so far,
    which floors the latest forecast.
    """

    def __init__(self, base_features, params, distributors=(), use_track=True):
        self.base_features = list(base_features)
        self.params = dict(params)
        self.distributors = list(distributors)
        self.use_track = use_track
        self.models_ = {}  # stage -> (us regressor, ratio regressor)

    @property
    def inputs(self):
        """Every snapshot key predict() reads."""
        return self.base_features + RUN_FACTS + ['weeks']

    # -- features ------------------------------------------------------------
    def features(self, stage):
        f = self.base_features + ['log_open_theaters', 'per_theater', 'dist_code', 'is_streamer'] \
            + ['mpaa_' + r.replace('-', '') for r in MPAA_RATINGS] \
            + (TRACK_FEATURES if self.use_track else []) \
            + ['log_intl_open', 'intl_markets']
        if stage >= 2:
            f += ['run_log_to_date', 'run_log_last', 'run_last_drop', 'run_log_theater_change']
        return f

    def stage_row(self, raw, stage):
        """(model inputs, US gross to date) for one raw row at `stage`, using
        only what is known after that many US weekends."""
        ow = max(_num(raw.get('opening_weekend')) or 1.0, 1.0)
        x = {f: _num(raw.get(f)) for f in self.base_features}
        x.update({f: _num(raw.get(f)) for f in TRACK_FEATURES})
        theaters = _num(raw.get('open_theaters'))
        x['log_open_theaters'] = np.log1p(theaters)
        x['per_theater'] = np.log1p(ow / theaters) if theaters and theaters > 0 else np.nan
        dist = str(raw.get('distributor') or '')
        x['dist_code'] = self.distributors.index(dist) if dist in self.distributors else -1
        x['is_streamer'] = int(any(s in dist for s in STREAMERS))
        for r in MPAA_RATINGS:
            x['mpaa_' + r.replace('-', '')] = int(raw.get('mpaa') == r)
        intl = _num(raw.get(f'intl_open_w{stage}'))
        x['log_intl_open'] = np.log1p(intl) - np.log(ow) if not np.isnan(intl) else np.nan
        x['intl_markets'] = _num(raw.get(f'intl_markets_w{stage}'))

        weeks = run_weeks(raw)[:stage]
        to_date = _num(weeks[-1].get('to_date')) if weeks else np.nan
        if np.isnan(to_date) or to_date <= 0:
            to_date = ow
        if stage >= 2 and len(weeks) >= 2:
            last, prev = _num(weeks[-1].get('weekend_gross')), _num(weeks[-2].get('weekend_gross'))
            x['run_log_to_date'] = np.log(to_date / ow)
            x['run_log_last'] = np.log(max(last, 1) / ow)
            x['run_last_drop'] = np.log(max(last, 1) / max(prev, 1))
            x['run_log_theater_change'] = np.log(max(_num(weeks[-1].get('theaters')) or 1, 1)
                                                 / max(theaters or 1, 1))
        return x, to_date

    def _matrix(self, raws, stage):
        rows, bases = zip(*(self.stage_row(r, stage) for r in raws))
        return pd.DataFrame(list(rows)).reindex(columns=self.features(stage)).astype(float), np.array(bases)

    # -- fit / predict -------------------------------------------------------
    def fit(self, raws, us_total, total):
        """raws: list of raw dicts; us_total / total: their US and worldwide
        totals. Stage k trains on the films that played at least k weekends."""
        us_total, total = np.asarray(us_total, float), np.asarray(total, float)
        for k in range(1, MAX_STAGE + 1):
            idx = [i for i, r in enumerate(raws) if reached(r, k)]
            X, to_date = self._matrix([raws[i] for i in idx], k)
            keep = us_total[idx] >= to_date * 0.98  # a US total below the to-date is a broken row
            us = XGBRegressor(**self.params).fit(X[keep], np.log(us_total[idx][keep] / to_date[keep]))
            ratio = XGBRegressor(**self.params).fit(X[keep], np.log(total[idx][keep] / us_total[idx][keep]))
            self.models_[k] = (us, ratio)
        return self

    def _rows(self, X):
        return X.to_dict('records') if isinstance(X, pd.DataFrame) else list(X)

    def predict_parts(self, X, stage=None):
        """(worldwide, US) totals for each raw row, each at its own stage
        (or at `stage`, capped by the weekends it has)."""
        ww, us_out = [], []
        for raw in self._rows(X):
            k = stage_of(raw) if stage is None else min(stage, stage_of(raw))
            x, to_date = self._matrix([raw], k)
            us_m, ratio_m = self.models_[k]
            us = to_date[0] * np.exp(us_m.predict(x)[0])
            total = us * np.exp(ratio_m.predict(x)[0])
            if stage is None:
                # The latest forecast never sits below what the film has
                # already grossed worldwide (a live fact the stage models,
                # which only see international openings, can't know). Never
                # applied to an earlier stage's call, which must not see it.
                total = max(total, _num(raw.get('ww_to_date')) or 0)
            us_out.append(us)
            ww.append(total)
        return np.array(ww), np.array(us_out)

    def predict(self, X, stage=None):
        return self.predict_parts(X, stage)[0]

    def explain(self, X):
        """Break the first row's multiplier (worldwide / opening weekend) into
        factors: base x one factor per RUN_EXPLAIN_GROUPS group. SHAP values of
        the US and ratio models add in log space, as do the gross-to-date and
        opening terms, so the factors multiply back to the prediction."""
        raw = self._rows(X)[0]
        k = stage_of(raw)
        x, to_date = self._matrix([raw], k)
        ow = max(_num(raw.get('opening_weekend')) or 1.0, 1.0)
        by_feature, bias = {}, 0.0
        for m in self.models_[k]:
            contribs = m.get_booster().predict(DMatrix(x), pred_contribs=True)[0]
            bias += contribs[-1]
            for f, v in zip(x.columns, contribs[:-1]):
                by_feature[f] = by_feature.get(f, 0.0) + v
        # US gross to date vs the opening weekend: part of the run so far.
        by_feature['run_to_date_vs_opening'] = float(np.log(to_date[0] / ow))
        # The worldwide-gross-to-date floor (predict_parts) is also the run so far.
        unfloored = ow * np.exp(bias + sum(by_feature.values()))
        floor = _num(raw.get('ww_to_date')) or 0
        if floor > unfloored:
            by_feature['run_ww_to_date_floor'] = float(np.log(floor / unfloored))
        factors = {
            group: float(np.exp(sum(v for f, v in by_feature.items() if belongs(f))))
            for group, belongs in RUN_EXPLAIN_GROUPS.items()
        }
        return float(np.exp(bias)), factors
