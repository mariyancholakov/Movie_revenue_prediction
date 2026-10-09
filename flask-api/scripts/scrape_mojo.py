"""Scrape Box Office Mojo for every seed film: theatrical totals split into
domestic and international, theater counts, distributor, MPAA rating,
international market openings, overseas gross to date in the big markets
and the domestic weekend-by-weekend run.

Stages, so the slow part runs once and every number stays traceable (see
mojo_cache.py for the pages and the cache):

  fetch   downloads each film's pages into data/mojo_cache/. Re-runnable:
          cached pages are never re-fetched.
  charts  downloads the big overseas markets' weekly charts back to 2000
          (about 17,000 pages, 3-4 hours), from --through YEAR-WEEK.
  parse   reads only the cache and writes
            data/mojo.csv           one row per film (tmdb_id, imdb_id, ...)
            data/mojo_weekends.csv  one row per film per domestic weekend

    ./venv/bin/python scripts/scrape_mojo.py fetch [--workers 1] [--delay 1.5]
    ./venv/bin/python scripts/scrape_mojo.py charts --through 2026-40
    ./venv/bin/python scripts/scrape_mojo.py parse
"""
import argparse
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.getcwd())

import pandas as pd  # noqa: E402

import mojo_cache  # noqa: E402
from mojo_cache import chart_index, fetch_charts, fetch_film, parse_film  # noqa: E402

SEED_CSV = 'data/movies_final.csv'
OUT_FILMS = 'data/mojo.csv'
OUT_WEEKENDS = 'data/mojo_weekends.csv'


def run_fetch(workers):
    ids = pd.read_csv(SEED_CSV)['imdb_id'].dropna().unique().tolist()
    print(f'{len(ids)} films')
    done, failed, started = 0, [], time.time()
    with ThreadPoolExecutor(workers) as ex:
        futures = {ex.submit(fetch_film, i): i for i in ids}
        for fut in as_completed(futures):
            done += 1
            try:
                fut.result()
            except Exception as e:  # noqa: BLE001 - report and keep going
                failed.append((futures[fut], str(e)))
            if done % 200 == 0:
                rate = done / (time.time() - started)
                print(f'  {done}/{len(ids)}  {rate:.1f} films/s  failed {len(failed)}', flush=True)
    print(f'done: {done - len(failed)} ok, {len(failed)} failed')
    for f in failed[:20]:
        print('  !', *f)


def run_parse():
    seed = pd.read_csv(SEED_CSV)[['tmdb_id', 'imdb_id']].dropna()
    charts = chart_index()
    rows, weekends = [], []
    for r in seed.itertuples():
        row, weeks = parse_film(r.tmdb_id, r.imdb_id, charts)
        rows.append(row)
        if weeks is not None:
            weekends.append(weeks)
    films = pd.DataFrame(rows)
    films.to_csv(OUT_FILMS, index=False)
    pd.concat(weekends, ignore_index=True).to_csv(OUT_WEEKENDS, index=False)
    print(f'{len(films)} films -> {OUT_FILMS}')
    print(films.notna().mean().round(3).to_string())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('stage', choices=['fetch', 'charts', 'parse'])
    ap.add_argument('--workers', type=int, default=1)
    ap.add_argument('--delay', type=float, default=mojo_cache.DELAY)
    ap.add_argument('--through', default=None, help='charts: the latest week, YEAR-WEEK')
    args = ap.parse_args()
    mojo_cache.DELAY = args.delay
    if args.stage == 'fetch':
        run_fetch(args.workers)
    elif args.stage == 'charts':
        if not args.through:
            ap.error('charts needs --through YEAR-WEEK')
        fetch_charts(tuple(int(v) for v in args.through.split('-')))
    else:
        run_parse()


if __name__ == '__main__':
    main()
