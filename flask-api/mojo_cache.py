"""Box Office Mojo pages through an on-disk cache, parsed into model facts.

Every page is stored gzipped in data/mojo_cache/ (gitignored), keyed by URL
path, so a number in data/mojo.csv can always be traced back to the page it
came from and re-parsed without re-downloading. Used by the seed backfill
(scripts/scrape_mojo.py) and by retrain.py for captured runs.

Pages per film:
  /title/<imdb>/               all-release totals, distributor, MPAA, the
                               ORIGINAL release's totals (re-releases like
                               Avatar's would otherwise inflate the run) and a
                               link to the domestic release
  /releasegroup/<gr>/          the original release's per-market table (each
                               international market's opening date and opening
                               weekend); only for titles with re-releases,
                               whose title page doesn't list markets
  /release/<rl>/weekend/       the domestic weekend table: theaters, gross,
                               gross to date
  /release/<rl>/               the domestic daily table: the opening week's
                               day-by-day shape

Overseas gross to date (mojo_parse.international_to_date) comes from each
big market's weekly chart, /weekend/<year>W<week>/?area=GB (fetch_charts;
about 17,000 pages back to 2000, shared by every film), or for a few films
from their own market releases, /release/<rl>/weekend/ (fetch_film with
markets=True), which carry the same gross to date and are what the live
app reads.
"""
import glob
import gzip
import os
import re
import threading
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from datetime import date

import pandas as pd
import requests
from bs4 import BeautifulSoup

from mojo_parse import (INTL_TD_MARKETS, chart_to_date, domestic_daily_path, domestic_release_path,
                        film_facts, international_to_date, market_releases, opening_week_shape,
                        original_group_path, release_to_date, weekend_frame, weekend_table)
from scraper import HEADERS

CACHE_DIR = 'data/mojo_cache'
BASE = 'https://www.boxofficemojo.com'
# Seconds to wait after each request, per worker. Mojo answers bursts with
# 503s for several minutes, so the default is gentle.
DELAY = 1.5

_session = threading.local()


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
            os.makedirs(CACHE_DIR, exist_ok=True)
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


def fetch_film(imdb_id, markets=False):
    """Download (or find cached) every page parse_film needs for one film;
    with markets=True also its big markets' release pages (for films the
    cached charts don't cover yet)."""
    title_html = fetch(f'/title/{imdb_id}/')
    title = _soup(title_html)
    if title is None:
        return 'no title page'
    group = original_group_path(title)
    if group:
        fetch(group)
    rel = domestic_release_path(title)
    if rel:
        fetch(rel)
        fetch(domestic_daily_path(title))
    if markets:
        for rl, _ in market_releases(_soup(fetch(group)) if group else title).values():
            fetch(f'/release/{rl}/weekend/')
    return 'ok'


def fetch_charts(last, first_year=2000):
    """Download (or find cached) the big markets' weekly charts from week
    `last` = (year, week) back to `first_year`, two markets at a time. A
    market stops at a year without any chart (China's start in 2015)."""
    def crawl(areas):
        for area in areas:
            for year in range(last[0], first_year - 1, -1):
                found = 0
                # Mojo has no week 53, and asking for one stalls in retries.
                for week in range(last[1] if year == last[0] else 52, 0, -1):
                    html = fetch(f'/weekend/{year}W{week:02d}/?area={area}')
                    found += bool(chart_to_date(_soup(html), None))
                print(f'  {area} {year}: {found} charts', flush=True)
                if not found:
                    break
    areas = list(INTL_TD_MARKETS.values())
    with ThreadPoolExecutor(2) as ex:
        list(ex.map(crawl, [areas[0::2], areas[1::2]]))


_CHART = re.compile(r'weekend__(\d{4})W(\d{2})__\?area=([A-Z]{2})\.html\.gz$')


def _chart_rows(path):
    year, week, _ = _CHART.search(path).groups()
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        html = f.read()
    soup = BeautifulSoup(html, 'lxml') if html else None
    return chart_to_date(soup, pd.Timestamp(date.fromisocalendar(int(year), int(week), 7)))


def chart_index():
    """{release id: [(Sunday, gross to date)]} from every cached big-market
    chart. Parsing them takes a minute, so parse_film takes it as an argument."""
    areas = set(INTL_TD_MARKETS.values())
    files = [f for f in glob.glob(os.path.join(CACHE_DIR, 'weekend__*'))
             if _CHART.search(f) and _CHART.search(f).group(3) in areas]
    out = {}
    with ProcessPoolExecutor() as ex:
        for rows in ex.map(_chart_rows, files, chunksize=50):
            for rl, sunday, to_date in rows:
                out.setdefault(rl, []).append((sunday, to_date))
    return out


def parse_weekends(html):
    df = weekend_frame(_soup(html))
    return weekend_table(df) if df is not None else None


def market_to_date(market_page, charts=None):
    """{market: [(Sunday, gross to date)]} for a film's big-market releases:
    from the release's own cached page when there is one, else from the
    charts (chart_index())."""
    out = {}
    for name, (rl, released) in market_releases(market_page).items():
        html = _read_cached(f'/release/{rl}/weekend/')
        out[name] = release_to_date(parse_weekends(html), released) if html else (charts or {}).get(rl, [])
    return out


def parse_film(tmdb_id, imdb_id, charts=None):
    """(facts dict, weekend table or None) for one film, from the cache only.
    `charts`: chart_index(), for the overseas gross to date."""
    title = _soup(_read_cached(f'/title/{imdb_id}/'))
    row = {'tmdb_id': tmdb_id, 'imdb_id': imdb_id}
    if title is None:
        return row, None
    group = original_group_path(title)
    rel = domestic_release_path(title)
    weeks = parse_weekends(_read_cached(rel)) if rel else None
    market_page = _soup(_read_cached(group)) if group else title
    row.update(film_facts(title, market_page, weeks))
    if market_page is not None:
        row.update(international_to_date(market_to_date(market_page, charts), row['us_release']))
    if rel:
        row.update(opening_week_shape(_soup(_read_cached(domestic_daily_path(title)))))
    row['mojo_release'] = rel
    if weeks is not None:
        weeks.insert(0, 'tmdb_id', tmdb_id)
    return row, weeks
