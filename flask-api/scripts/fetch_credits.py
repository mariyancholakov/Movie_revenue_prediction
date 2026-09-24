"""Fetch each seed film's director(s) and top-billed cast from TMDB credits.

Writes data/credits.csv: tmdb_id, director_ids, cast_ids ('|'-joined TMDB
person ids, cast in billing order). The names themselves are too sparse to
learn from; model_lib turns these ids into leak-free track records (how that
director's and lead cast's EARLIER films did). Re-runnable: films already in
the file are skipped.

    ./venv/bin/python scripts/fetch_credits.py
"""
import os
import sys
from concurrent.futures import ThreadPoolExecutor

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.getcwd())

import pandas as pd  # noqa: E402

from model_lib import credit_ids  # noqa: E402
from scraper import TMDB_API_KEY, _tmdb_get  # noqa: E402

SEED_CSV = 'data/movies_final.csv'
OUT = 'data/credits.csv'


def fetch(tmdb_id):
    data = _tmdb_get(f"https://api.themoviedb.org/3/movie/{tmdb_id}/credits?api_key={TMDB_API_KEY}")
    if data is None:
        return None
    directors, cast = credit_ids(data)
    return {'tmdb_id': tmdb_id, 'director_ids': directors, 'cast_ids': cast}


def main():
    ids = pd.read_csv(SEED_CSV)['tmdb_id'].tolist()
    have = pd.read_csv(OUT) if os.path.exists(OUT) else pd.DataFrame(columns=['tmdb_id'])
    todo = [i for i in ids if i not in set(have['tmdb_id'])]
    print(f'{len(todo)} films to fetch')
    with ThreadPoolExecutor(8) as ex:
        rows = [r for r in ex.map(fetch, todo) if r]
    out = pd.concat([have, pd.DataFrame(rows)], ignore_index=True)
    out.to_csv(OUT, index=False)
    print(f'{len(rows)} fetched, {len(todo) - len(rows)} failed -> {OUT} ({len(out)} films)')


if __name__ == '__main__':
    main()
