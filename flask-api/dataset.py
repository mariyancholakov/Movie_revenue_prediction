"""The training set, assembled the same way for retrain.py and for the API's
track-record history.

A film's row = the seed CSV's TMDB features + Box Office Mojo facts
(data/mojo.csv, data/mojo_weekends.csv from scripts/scrape_mojo.py) + TMDB
credits (data/credits.csv) + leak-free director/cast track records.

Labels:
  us_total  Mojo's domestic total for the original release
  total     worldwide total: Mojo's when Mojo reports international grosses,
            else the larger of TMDB `revenue` and Mojo's US total. TMDB
            sometimes stores only the US gross (The Secret Life of Pets 2:
            $155M vs $431M worldwide). Mojo lacks international figures for
            most pre-2000 films, and for about three in four of those (872 of
            1,151 seed films) TMDB has only the US gross too, so their label
            is in effect a US total.
"""
import numpy as np
import pandas as pd

from model_lib import franchise_row, track_records

SEED_CSV = 'data/movies_final.csv'
MOJO_CSV = 'data/mojo.csv'
WEEKENDS_CSV = 'data/mojo_weekends.csv'
CREDITS_CSV = 'data/credits.csv'
WEEK_COLUMNS = ['week', 'weekend_gross', 'theaters', 'to_date']
# International grosses below this share of the US total mean Mojo has no
# real foreign figures for the film.
MIN_INTL_SHARE = 0.02


def load_seed():
    """The seed CSV with the franchise and release-year columns derived the
    same way the API derives them (model_lib.franchise_row)."""
    seed = pd.read_csv(SEED_CSV).dropna(subset=['revenue'])
    derived = pd.DataFrame([
        franchise_row(r.release_date, r.collection_id, [], r.tmdb_id) for r in seed.itertuples()
    ], index=seed.index)
    # prior_parts was counted from the full collection by scripts/enrich_seed.py.
    derived['prior_parts'] = seed['prior_parts']
    derived['is_sequel'] = (seed['prior_parts'] > 0).astype(int)
    return pd.concat([seed.drop(columns=['prior_parts']), derived], axis=1)


def clean_total(tmdb_revenue, dom, intl, ww):
    """The worldwide label (see module docstring). Works on scalars or arrays."""
    dom = np.nan_to_num(np.asarray(dom, dtype=float))
    intl_ok = np.nan_to_num(np.asarray(intl, dtype=float)) > MIN_INTL_SHARE * dom
    return np.where(intl_ok, np.asarray(ww, dtype=float),
                    np.maximum(np.asarray(tmdb_revenue, dtype=float), dom))


def weeks_by_film():
    wk = pd.read_csv(WEEKENDS_CSV).drop_duplicates(['tmdb_id', 'week']).sort_values(['tmdb_id', 'week'])
    return {t: g[WEEK_COLUMNS].to_dict('records') for t, g in wk.groupby('tmdb_id')}


def add_mojo(films, mojo):
    """Merge Mojo facts onto films and set the us_total / total labels.
    `films` needs tmdb_id and revenue (TMDB's worldwide figure)."""
    mojo = mojo.drop(columns=['imdb_id'], errors='ignore').drop_duplicates('tmdb_id')
    d = films.merge(mojo, on='tmdb_id', how='left')
    d['us_total'] = d['dom_orig']
    d['total'] = clean_total(d['revenue'], d['dom_orig'], d['intl_orig'], d['ww_orig'])
    return d


def load_seed_dataset():
    """Seed films with Mojo facts, credits, labels and track records."""
    d = load_seed().merge(pd.read_csv(CREDITS_CSV), on='tmdb_id', how='left')
    d = add_mojo(d, pd.read_csv(MOJO_CSV))
    d = pd.concat([d, track_records(d, d)], axis=1)
    weeks = weeks_by_film()
    d['weeks'] = [weeks.get(t, []) for t in d['tmdb_id']]
    return d


def history():
    """Films with known outcomes, for track records of films priced live."""
    d = load_seed().merge(pd.read_csv(CREDITS_CSV), on='tmdb_id', how='left')
    d = add_mojo(d, pd.read_csv(MOJO_CSV))
    return d[['release_date', 'director_ids', 'cast_ids', 'total', 'opening_weekend']]


def raw_rows(d):
    """The rows as RunModel's raw dicts."""
    return d.to_dict('records')
