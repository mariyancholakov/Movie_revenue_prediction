"""Add the US releases the seed set lacks, found on Box Office Mojo's domestic
weekend charts.

The seed set came from TMDB with filters (a reported budget, 100+ votes), so
it holds about 160 films a year and misses even wide releases (2012: Total
Recall, Madea's Witness Protection). RunModel reads neither budget nor votes,
so those filters only cost it training data: on the holdout, the opening call
went 26.7% -> 25.5% -> 25.0% with 50% / 75% / 100% of the training films.

Tried 2026-10-09 and NOT adopted: the 4,000 largest missing releases gave
3,566 films (median opening $130K in 61 theaters, a quarter without overseas
figures), and on the same holdout films the opening call went 24.2% -> 24.7%
(MAE +$2M); keeping only those opening to $250K+ or $1M+ moved it within
seed noise, one way on the 2017+ holdout and the other on 2022+. The
random-subsample learning curve above dropped films like the ones priced;
these are mostly smaller and noisier.

  list  every release on the domestic weekend charts YEAR_FROM..YEAR_TO
        (through mojo_cache, so cached charts aren't re-fetched) ->
        data/mojo_releases.csv: rl id, title, opening weekend, theaters.
  add   for each listed release the seed set lacks: its Mojo pages
        (mojo_cache.fetch_film), skipping re-releases (the title's original
        domestic release must be this one) and openings under MIN_OPENING;
        then TMDB details found by IMDb id, built into a seed-format row by
        the API's own build_feature_row, as scripts/backfill_recent.py does.
        Appends to data/movies_final.csv. Re-runnable.

Afterwards: scripts/fetch_credits.py, then scripts/scrape_mojo.py parse.

    ./venv/bin/python scripts/add_mojo_releases.py list
    ./venv/bin/python scripts/add_mojo_releases.py add [--limit N]
"""
import argparse
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from io import StringIO

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.getcwd())

import pandas as pd  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402

import mojo_cache  # noqa: E402
from app import build_feature_row  # noqa: E402
from mojo_parse import domestic_release_path  # noqa: E402
from scraper import TMDB_API_KEY, _tmdb_get, get_movie_details, get_opening_weekend  # noqa: E402

SEED_CSV = 'data/movies_final.csv'
RELEASES_CSV = 'data/mojo_releases.csv'
YEAR_FROM, YEAR_TO = 2000, 2025
MIN_OPENING = 10_000  # smaller openings are festival bookings and one-night events
MOJO_WORKERS = 2  # Mojo blocks for minutes at 3+ concurrent clients


def _money(text):
    text = str(text or '').replace('$', '').replace(',', '').strip()
    return int(text) if text.isdigit() else None


def chart_releases(year, week):
    """The releases new on one domestic weekend chart."""
    html = mojo_cache.fetch(f'/weekend/{year}W{week:02d}/')
    table = BeautifulSoup(html, 'lxml').find('table') if html else None
    if table is None:
        return []
    df = pd.read_html(StringIO(str(table)))[0]
    links = [a['href'] for tr in table.find_all('tr')[1:]
             for a in tr.find_all('a', href=re.compile(r'^/release/rl'))[:1]]
    if len(links) != len(df) or 'Weeks' not in df:
        print(f'! unexpected layout: {year}W{week}', flush=True)
        return []
    df['rl'] = [re.search(r'rl\d+', h).group(0) for h in links]
    new = df[(df.get('New This Week', pd.Series(dtype=str)).astype(str).str.lower() == 'true')
             | (pd.to_numeric(df['Weeks'], errors='coerce') == 1)]
    return [{'rl': r.rl, 'title': r.Release, 'year': year, 'week': week,
             'opening': _money(r.Gross), 'theaters': _money(r.Theaters)} for r in new.itertuples()]


def run_list():
    def crawl(years):
        return [r for y in years for w in range(1, 53) for r in chart_releases(y, w)]
    years = list(range(YEAR_TO, YEAR_FROM - 1, -1))
    with ThreadPoolExecutor(MOJO_WORKERS) as ex:
        rows = [r for part in ex.map(crawl, [years[0::2], years[1::2]]) for r in part]
    out = pd.DataFrame(rows).drop_duplicates('rl').sort_values(['year', 'week'])
    out.to_csv(RELEASES_CSV, index=False)
    print(f'{len(out)} releases -> {RELEASES_CSV}')


def mojo_side(rl):
    """(imdb_id, None) for an original release whose pages are now cached,
    or (None, reason)."""
    try:
        page = mojo_cache.fetch(f'/release/{rl}/')
        m = re.search(r'/title/(tt\d+)', page or '')
        if not m:
            return None, 'no title link'
        imdb_id = m.group(1)
        mojo_cache.fetch_film(imdb_id)
        title = BeautifulSoup(mojo_cache._read_cached(f'/title/{imdb_id}/') or '', 'lxml')
        if domestic_release_path(title) != f'/release/{rl}/weekend/':
            return None, 're-release'
        return imdb_id, None
    except ConnectionError as e:
        return None, f'mojo: {e}'


def tmdb_side(imdb_id):
    """A seed-format row for one film, or (None, reason)."""
    found = _tmdb_get(f'https://api.themoviedb.org/3/find/{imdb_id}?api_key={TMDB_API_KEY}&external_source=imdb_id')
    movies = (found or {}).get('movie_results') or []
    if not movies:
        return None, 'not on tmdb'
    details = get_movie_details(movies[0]['id'])
    if not details or not details.get('release_date'):
        return None, 'tmdb details'
    title = BeautifulSoup(mojo_cache._read_cached(f'/title/{imdb_id}/') or '', 'html.parser')
    opening = get_opening_weekend(imdb_id, title)
    if not opening:
        return None, 'no opening weekend'
    try:
        features = build_feature_row(details, opening).iloc[0].to_dict()
    except (ConnectionError, KeyError, ValueError) as e:
        return None, f'features: {e}'
    collection = details.get('belongs_to_collection') or {}
    return {**features, 'title': details.get('title'), 'vote_average': details.get('vote_average'),
            'vote_count': details.get('vote_count'), 'revenue': details.get('revenue') or 0,
            'imdb_id': imdb_id, 'tmdb_id': details['id'], 'release_date': details.get('release_date'),
            'collection_id': collection.get('id')}, None


def run_add(limit):
    seed = pd.read_csv(SEED_CSV)
    releases = pd.read_csv(RELEASES_CSV)
    have = set(pd.read_csv('data/mojo.csv')['mojo_release'].dropna().str.extract(r'(rl\d+)')[0])
    todo = releases[~releases['rl'].isin(have) & (releases['opening'].fillna(0) >= MIN_OPENING)]
    todo = todo.sort_values('opening', ascending=False).head(limit) if limit else todo
    print(f'{len(todo)} releases to add', flush=True)

    started, imdb_ids, skipped = time.time(), [], []
    with ThreadPoolExecutor(MOJO_WORKERS) as ex:
        for n, (imdb_id, why) in enumerate(ex.map(mojo_side, todo['rl']), 1):
            (imdb_ids.append(imdb_id) if imdb_id else skipped.append(why))
            if n % 250 == 0:
                print(f'  mojo {n}/{len(todo)} ({(time.time() - started) / 60:.0f} min)', flush=True)
    known = set(seed['imdb_id'].dropna())
    imdb_ids = [i for i in dict.fromkeys(imdb_ids) if i not in known]
    print(f'{len(imdb_ids)} original releases not in the seed set', flush=True)

    with ThreadPoolExecutor(4) as ex:
        results = list(ex.map(tmdb_side, imdb_ids))
    rows = [r for r, _ in results if r]
    skipped += [why for r, why in results if not r]
    print(f'kept {len(rows)}; skipped: {pd.Series(skipped).str.split(":").str[0].value_counts().to_dict()}')
    if not rows:
        return
    new = pd.DataFrame(rows)
    new = new[~new['tmdb_id'].isin(seed['tmdb_id'])].drop_duplicates('tmdb_id').reindex(columns=seed.columns)
    for c in ('release_season_Fall', 'release_season_Spring', 'release_season_Summer', 'release_season_Winter'):
        new[c] = new[c].astype(bool)
    out = pd.concat([seed, new], ignore_index=True)
    out['tmdb_id'] = out['tmdb_id'].astype('Int64')
    out['collection_id'] = out['collection_id'].astype('Int64')
    out.to_csv(SEED_CSV, index=False)
    print(f'seed now {len(out)} films (+{len(new)})')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('stage', choices=['list', 'add'])
    ap.add_argument('--limit', type=int, default=0, help='add at most this many releases, largest openings first')
    args = ap.parse_args()
    run_list() if args.stage == 'list' else run_add(args.limit)


if __name__ == '__main__':
    main()
