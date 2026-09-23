"""Add TMDB release date and franchise columns to the seed dataset.

The seed CSV only had a release month, so the model couldn't tell a 1995 film
from a 2023 one, or a sequel from an original. This looks each film up on TMDB
(by IMDb id) and writes four columns back into data/movies_final.csv:

    tmdb_id, release_date, collection_id, prior_parts

`prior_parts` counts earlier-released films in the same TMDB collection, the
same way the API computes it for a film in theaters (model_lib.franchise_row).

One-off, re-runnable (~5,000 films, a few minutes):
    ./venv/bin/python scripts/enrich_seed.py
"""
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
import requests
from dotenv import load_dotenv

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
load_dotenv()

SEED_CSV = 'data/movies_final.csv'
API = 'https://api.themoviedb.org/3'
KEY = os.environ['TMDB_API_KEY']
session = requests.Session()


def get(path):
    for attempt in range(5):
        try:
            r = session.get(f'{API}{path}', params={'api_key': KEY}, timeout=15)
        except requests.RequestException:
            time.sleep(1)
            continue
        if r.status_code == 429:
            time.sleep(1 + attempt)
            continue
        return r.json() if r.status_code == 200 else None
    return None


def lookup(imdb_id):
    d = get(f'/movie/{imdb_id}') or {}
    coll = d.get('belongs_to_collection') or {}
    return {'imdb_id': imdb_id, 'tmdb_id': d.get('id'),
            'release_date': d.get('release_date'), 'collection_id': coll.get('id')}


def collection_parts(cid):
    d = get(f'/collection/{cid}') or {}
    return cid, [(p.get('id'), p.get('release_date')) for p in d.get('parts', [])]


def main():
    seed = pd.read_csv(SEED_CSV)
    seed = seed.drop(columns=[c for c in ('tmdb_id', 'release_date', 'collection_id', 'prior_parts')
                              if c in seed.columns])

    with ThreadPoolExecutor(16) as pool:
        found = pd.DataFrame(pool.map(lookup, seed['imdb_id']))
    cids = found['collection_id'].dropna().astype(int).unique()
    with ThreadPoolExecutor(16) as pool:
        parts = dict(pool.map(collection_parts, cids))

    def prior(r):
        if pd.isna(r['collection_id']) or not r['release_date']:
            return 0
        return sum(1 for pid, rd in parts.get(int(r['collection_id']), [])
                   if rd and rd < r['release_date'] and pid != r['tmdb_id'])

    found['prior_parts'] = found.apply(prior, axis=1)
    missing = found['release_date'].isna().sum()
    if missing:
        print(f'! {missing} films have no TMDB release date', file=sys.stderr)

    out = seed.merge(found, on='imdb_id', how='left')
    out['tmdb_id'] = out['tmdb_id'].astype('Int64')
    out['collection_id'] = out['collection_id'].astype('Int64')
    out.to_csv(SEED_CSV, index=False)
    print(f'{len(out)} films, {out["collection_id"].notna().sum()} in a collection, '
          f'{(out["prior_parts"] > 0).sum()} sequels')


if __name__ == '__main__':
    main()
