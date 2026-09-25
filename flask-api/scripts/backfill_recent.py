"""Append recent, finished releases to the seed dataset.

The seed data stops at September 2023 and has few post-pandemic films, so the
model learned mostly from an era of longer theatrical runs. This adds films
released between the seed's last date and BACKFILL_UNTIL (old enough that
TMDB's worldwide revenue is settled), with the same filters the seed set
shows: a reported budget, revenue of at least $100K, MIN_VOTES TMDB votes and
a Box Office Mojo opening weekend.

Rows are built with the API's own build_feature_row, so a backfilled film
looks exactly like one priced live. Re-runnable: films already in the seed
file are skipped.

    ./venv/bin/python scripts/backfill_recent.py
"""
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.getcwd())

import pandas as pd  # noqa: E402

from app import build_feature_row  # noqa: E402
from scraper import (TMDB_API_KEY, _tmdb_get, get_movie_details,  # noqa: E402
                     get_opening_weekend, get_title_page)

SEED_CSV = 'data/movies_final.csv'
BACKFILL_UNTIL = os.getenv('BACKFILL_UNTIL', '2026-02-28')
MIN_REVENUE = 100_000
MIN_VOTES = int(os.getenv('BACKFILL_MIN_VOTES', '100'))
MAX_PAGES = 50  # 20 films a page, ordered by revenue


def candidate_ids(start, end):
    ids = []
    for page in range(1, MAX_PAGES + 1):
        data = _tmdb_get(
            f"https://api.themoviedb.org/3/discover/movie?api_key={TMDB_API_KEY}"
            f"&primary_release_date.gte={start}&primary_release_date.lte={end}"
            f"&vote_count.gte={MIN_VOTES}&sort_by=revenue.desc&page={page}")
        if not data or not data.get('results'):
            break
        ids += [m['id'] for m in data['results']]
        if page >= data.get('total_pages', 1):
            break
    return ids


def build(tmdb_id):
    """A seed-format row for one film, or (None, reason)."""
    details = get_movie_details(tmdb_id)
    if not details:
        return None, 'tmdb unavailable'
    if (details.get('revenue') or 0) < MIN_REVENUE:
        return None, 'no revenue'
    if not details.get('budget'):
        return None, 'no budget'
    imdb_id = (details.get('external_ids') or {}).get('imdb_id')
    if not imdb_id:
        return None, 'no imdb id'
    time.sleep(0.5)  # be polite to Box Office Mojo
    opening = get_opening_weekend(imdb_id, get_title_page(imdb_id))
    if not opening:
        return None, 'no opening weekend'
    try:
        features = build_feature_row(details, opening).iloc[0].to_dict()
    except (ConnectionError, KeyError, ValueError) as e:
        return None, f'features: {e}'
    collection = details.get('belongs_to_collection') or {}
    return {
        **features,
        'title': details.get('title'),
        'vote_average': details.get('vote_average'),
        'vote_count': details.get('vote_count'),
        'revenue': details['revenue'],
        'imdb_id': imdb_id,
        'tmdb_id': details['id'],
        'release_date': details.get('release_date'),
        'collection_id': collection.get('id'),
    }, None


def main():
    seed = pd.read_csv(SEED_CSV)
    start = (date.fromisoformat(seed['release_date'].max()) + timedelta(days=1)).isoformat()
    known = set(seed['tmdb_id'].dropna().astype(int))
    ids = [i for i in dict.fromkeys(candidate_ids(start, BACKFILL_UNTIL)) if i not in known]
    print(f"{len(ids)} candidate films released {start} .. {BACKFILL_UNTIL}")

    with ThreadPoolExecutor(4) as pool:
        results = list(pool.map(build, ids))
    rows = [r for r, _ in results if r]
    skipped = pd.Series([why for r, why in results if not r]).value_counts()
    print(f"kept {len(rows)}; skipped: {skipped.to_dict()}")
    if not rows:
        return

    new = pd.DataFrame(rows)
    # Seed-file columns only; the franchise flags and release_year are
    # re-derived at training time (dataset.load_seed).
    new = new.reindex(columns=seed.columns)
    for c in ('release_season_Fall', 'release_season_Spring', 'release_season_Summer', 'release_season_Winter'):
        new[c] = new[c].astype(bool)
    out = pd.concat([seed, new], ignore_index=True)
    out['tmdb_id'] = out['tmdb_id'].astype('Int64')
    out['collection_id'] = out['collection_id'].astype('Int64')
    out.to_csv(SEED_CSV, index=False)
    print(f"seed now {len(out)} films")


if __name__ == '__main__':
    main()
