"""Scrape Box Office Mojo for every seed film: theatrical totals split into
domestic and international, theater counts, distributor, MPAA rating and the
domestic weekend-by-weekend run.

Two stages, so the slow part runs once and every number stays traceable:

  fetch  downloads each film's pages into data/mojo_cache/ (gzipped HTML,
         keyed by URL path). Re-runnable: cached pages are never re-fetched.
  parse  reads only the cache and writes
           data/mojo.csv           one row per film (tmdb_id, imdb_id, ...)
           data/mojo_weekends.csv  one row per film per domestic weekend

Pages per film:
  /title/<imdb>/               all-release totals, distributor, MPAA, the
                               ORIGINAL release's totals (re-releases like
                               Avatar's would otherwise inflate the run) and a
                               link to the domestic release
  /release/<rl>/weekend/       the domestic weekend table: theaters, gross,
                               gross to date

    ./venv/bin/python scripts/scrape_mojo.py fetch [--workers 1] [--delay 1.5]
    ./venv/bin/python scripts/scrape_mojo.py parse
"""
import argparse
import gzip
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import StringIO

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.getcwd())

import pandas as pd  # noqa: E402
import requests  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402

from scraper import HEADERS  # noqa: E402

SEED_CSV = 'data/movies_final.csv'
CACHE_DIR = 'data/mojo_cache'
OUT_FILMS = 'data/mojo.csv'
OUT_WEEKENDS = 'data/mojo_weekends.csv'
BASE = 'https://www.boxofficemojo.com'

_session = threading.local()
# Seconds to wait after each request, per worker. Mojo answers bursts with
# 503s for several minutes, so the default is gentle; `fetch --delay` tunes it.
DELAY = 1.5


def _cache_path(path):
    return os.path.join(CACHE_DIR, path.strip('/').replace('/', '__') + '.html.gz')


def _read_cached(path):
    """The cached page, '' for a cached 404, or None if never fetched."""
    p = _cache_path(path)
    if not os.path.exists(p):
        return None
    with gzip.open(p, 'rt', encoding='utf-8') as f:
        return f.read()


def fetch(path):
    """GET a Mojo path through the cache. A 404 is cached as ''; throttling
    and server errors are retried with backoff and never cached."""
    cached = _read_cached(path)
    if cached is not None:
        return cached
    if not hasattr(_session, 's'):
        _session.s = requests.Session()
        _session.s.headers.update(HEADERS)
    for attempt in range(8):
        try:
            r = _session.s.get(BASE + path, timeout=20)
        except requests.RequestException:
            time.sleep(2 ** attempt)
            continue
        if r.status_code in (200, 404):
            html = r.text if r.status_code == 200 else ''
            tmp = _cache_path(path) + '.tmp'
            with gzip.open(tmp, 'wt', encoding='utf-8') as f:
                f.write(html)
            os.replace(tmp, _cache_path(path))
            time.sleep(DELAY)
            return html
        # Throttled: back off for minutes, not seconds, or the block persists.
        time.sleep(min(60 * 2 ** attempt, 900) if r.status_code in (429, 503) else 2 ** attempt)
    raise ConnectionError(f'{path}: gave up after retries')


def _soup(html):
    return BeautifulSoup(html, 'html.parser') if html else None


def _money(text):
    text = (text or '').replace('$', '').replace(',', '').strip()
    return int(text) if text.isdigit() else None


def _int(text):
    text = re.sub(r'[^\d]', '', str(text or ''))
    return int(text) if text else None


def domestic_release_path(title):
    """The original domestic release's weekend page. The title page links its
    domestic opening figure to it."""
    for a in title.find_all('a', href=True):
        m = re.match(r'/release/(rl\d+)/weekend', a['href'])
        if m:
            return f'/release/{m.group(1)}/weekend/'
    return None


def original_release_totals(title):
    """(domestic, international, worldwide, number of release groups) for the
    original release, from the title page's by-release table. None when the
    title has a single release (the page totals are then that release's)."""
    for table in title.find_all('table'):
        if 'Release Group' not in table.get_text():
            continue
        df = pd.read_html(StringIO(str(table)))[0]
        orig = df[df['Release Group'] == 'Original Release']
        row = (orig if len(orig) else df).iloc[0]
        return (_money(row['Domestic']), _money(row['International']),
                _money(row['Worldwide']), len(df))
    return None


def fetch_film(imdb_id):
    title_html = fetch(f'/title/{imdb_id}/')
    title = _soup(title_html)
    if title is None:
        return 'no title page'
    rel = domestic_release_path(title)
    if rel:
        fetch(rel)
    return 'ok'


def run_fetch(workers):
    os.makedirs(CACHE_DIR, exist_ok=True)
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


def summary_values(soup):
    """The 'Summary Details' block as {label: text}."""
    out = {}
    div = soup.find('div', class_=re.compile('mojo-summary-values'))
    if not div:
        return out
    for row in div.find_all('div', recursive=False):
        spans = row.find_all('span', recursive=False)
        if len(spans) >= 2:
            out[spans[0].get_text(strip=True)] = spans[1].get_text(' ', strip=True)
    return out


def performance_totals(soup):
    """(domestic, international, worldwide) from the performance summary.
    International is None when Mojo has no foreign figures."""
    div = soup.find('div', class_=re.compile('mojo-performance-summary-table'))
    vals = {}
    if div:
        for block in div.find_all('div', recursive=False):
            label = block.find('span', class_='a-size-small')
            money = block.find('span', class_='money')
            if label is not None:
                key = label.get_text(' ', strip=True).split('(')[0].strip().lower()
                vals[key] = _money(money.get_text()) if money else None
    return vals.get('domestic'), vals.get('international'), vals.get('worldwide')


def parse_weekends(html):
    soup = _soup(html)
    if soup is None or not soup.find('table'):
        return None
    df = pd.read_html(StringIO(str(soup.find('table'))))[0]
    out = pd.DataFrame({
        'week': pd.to_numeric(df.get('Weekend.1'), errors='coerce'),
        'weekend_gross': df['Weekend'].map(_money),
        'theaters': df['Theaters'].map(_int),
        'to_date': df['To Date'].map(_money),
        'dates': df['Date'],
    })
    return out.dropna(subset=['week', 'weekend_gross'])


def parse_film(tmdb_id, imdb_id):
    title = _soup(_read_cached(f'/title/{imdb_id}/'))
    row = {'tmdb_id': tmdb_id, 'imdb_id': imdb_id}
    if title is None:
        return row, None
    summ = summary_values(title)
    row['distributor'] = (summ.get('Domestic Distributor') or '').replace('See full company information', '').strip() or None
    row['mpaa'] = summ.get('MPAA')
    row['dom_all'], row['intl_all'], row['ww_all'] = performance_totals(title)

    orig = original_release_totals(title)
    if orig:
        row['dom_orig'], row['intl_orig'], row['ww_orig'], row['n_release_groups'] = orig
    else:
        row['dom_orig'], row['intl_orig'], row['ww_orig'] = row['dom_all'], row['intl_all'], row['ww_all']
        row['n_release_groups'] = 1

    rel = domestic_release_path(title)
    row['mojo_release'] = rel
    weeks = parse_weekends(_read_cached(rel)) if rel else None
    if weeks is not None and len(weeks):
        weeks = weeks.sort_values('week')
        row['open_theaters'] = weeks['theaters'].iloc[0]
        row['widest_theaters'] = weeks['theaters'].max()
        row['weeks_in_release'] = int(weeks['week'].max())
        row['dom_release_total'] = weeks['to_date'].max()
        weeks.insert(0, 'tmdb_id', tmdb_id)
    return row, weeks


def run_parse():
    seed = pd.read_csv(SEED_CSV)[['tmdb_id', 'imdb_id']].dropna()
    rows, weekends = [], []
    for r in seed.itertuples():
        row, weeks = parse_film(r.tmdb_id, r.imdb_id)
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
    ap.add_argument('stage', choices=['fetch', 'parse'])
    ap.add_argument('--workers', type=int, default=1)
    ap.add_argument('--delay', type=float, default=DELAY)
    args = ap.parse_args()
    globals()['DELAY'] = args.delay
    run_fetch(args.workers) if args.stage == 'fetch' else run_parse()


if __name__ == '__main__':
    main()
