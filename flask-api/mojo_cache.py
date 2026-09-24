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
"""
import gzip
import os
import threading
import time
from io import StringIO

import pandas as pd
import requests
from bs4 import BeautifulSoup

from mojo_parse import domestic_release_path, film_facts, original_group_path, weekend_table
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


def fetch_film(imdb_id):
    """Download (or find cached) every page parse_film needs for one film."""
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
    return 'ok'


def parse_weekends(html):
    soup = _soup(html)
    if soup is None or not soup.find('table'):
        return None
    return weekend_table(pd.read_html(StringIO(str(soup.find('table'))))[0])


def parse_film(tmdb_id, imdb_id):
    """(facts dict, weekend table or None) for one film, from the cache only."""
    title = _soup(_read_cached(f'/title/{imdb_id}/'))
    row = {'tmdb_id': tmdb_id, 'imdb_id': imdb_id}
    if title is None:
        return row, None
    group = original_group_path(title)
    rel = domestic_release_path(title)
    weeks = parse_weekends(_read_cached(rel)) if rel else None
    row.update(film_facts(title, _soup(_read_cached(group)) if group else title, weeks))
    row['mojo_release'] = rel
    if weeks is not None:
        weeks.insert(0, 'tmdb_id', tmdb_id)
    return row, weeks
