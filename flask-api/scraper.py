import requests
from bs4 import BeautifulSoup
import pandas as pd
import numpy as np
from scipy.optimize import curve_fit
from io import StringIO
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os

from model_lib import franchise_row

HEADERS = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'}
load_dotenv()

TMDB_GENRE_MAP = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
    14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
}

TMDB_API_KEY = os.getenv('TMDB_API_KEY')

def _tmdb_fetch(url):
    """GET a TMDB endpoint. Returns (parsed JSON or None, HTTP status or None).
    Never raises: a TMDB outage or rate-limit becomes a graceful empty state,
    and the status lets callers tell "no such film" (404) from "TMDB is down"."""
    try:
        response = requests.get(url, timeout=10)
    except requests.RequestException as e:
        print(f"[tmdb] request failed: {e}")
        return None, None
    if response.status_code != 200:
        print(f"[tmdb] {response.status_code} for {url.split('?')[0]}")
        return None, response.status_code
    try:
        return response.json(), 200
    except ValueError:
        print(f"[tmdb] non-JSON response for {url.split('?')[0]}")
        return None, 200

def _tmdb_get(url):
    """Like _tmdb_fetch, but just the JSON (None on any failure)."""
    return _tmdb_fetch(url)[0]

# TMDB orders now-playing by popularity; the top NOW_PLAYING_PAGES pages
# (20 films each) are what the site shows. No region filter: TMDB's US list only
# covers films whose US release was in the last ~5 weeks, which drops the big
# holdovers still in theaters.
NOW_PLAYING_PAGES = 2
NOW_PLAYING_TTL = 15 * 60  # seconds; every page load asks for this list
# TMDB lists re-releases (e.g. an anniversary run) under the film's original
# release date. Their Box Office Mojo page describes the original run, so
# they can't be predicted meaningfully and are left out.
MAX_RELEASE_AGE_DAYS = 180
_now_playing_cache = {'at': 0.0, 'movies': None}


def _now_playing_page(page):
    url = (f"https://api.themoviedb.org/3/movie/now_playing?api_key={TMDB_API_KEY}"
           f"&language=en-US&page={page}")
    return _tmdb_get(url)


def _is_current_release(release_date):
    try:
        released = datetime.strptime(release_date, '%Y-%m-%d')
    except (TypeError, ValueError):
        return False
    return datetime.now() - released <= timedelta(days=MAX_RELEASE_AGE_DAYS)


US_RELEASE_TTL = 24 * 60 * 60  # seconds; release schedules rarely change day to day
_us_release_cache = {}  # tmdb id -> (fetched_at, date)


def get_us_theatrical_date(tmdb_id):
    """The film's first US theatrical release date (limited or wide) as
    'YYYY-MM-DD', '' if it has none (a streaming premiere, or a release
    outside the US), or None if TMDB couldn't be reached."""
    hit = _us_release_cache.get(tmdb_id)
    if hit and time.time() - hit[0] < US_RELEASE_TTL:
        return hit[1]
    data, status = _tmdb_fetch(f"https://api.themoviedb.org/3/movie/{tmdb_id}/release_dates?api_key={TMDB_API_KEY}")
    if not data:
        return '' if status == 404 else None
    # TMDB release types: 2 = theatrical (limited), 3 = theatrical.
    dates = [r.get('release_date', '')[:10]
             for country in data.get('results', []) if country.get('iso_3166_1') == 'US'
             for r in country.get('release_dates', []) if r.get('type') in (2, 3)]
    date = min((d for d in dates if d), default='')
    _us_release_cache[tmdb_id] = (time.time(), date)
    return date


def get_now_playing():
    """Films now playing in US theaters: the top NOW_PLAYING_PAGES pages from
    TMDB, kept only if they opened in US theaters within MAX_RELEASE_AGE_DAYS.
    That drops streaming premieres and releases outside the US (the model
    predicts from the US opening weekend, so those can never be priced) and
    re-releases (their first US date is the original run's). Cached in-process
    for NOW_PLAYING_TTL. Returns [] on failure."""
    if _now_playing_cache['movies'] is not None and time.time() - _now_playing_cache['at'] < NOW_PLAYING_TTL:
        return _now_playing_cache['movies']

    candidates, seen = [], set()
    for page in range(1, NOW_PLAYING_PAGES + 1):
        data = _now_playing_page(page)
        if not data or 'results' not in data:
            break
        for movie in data['results']:
            if movie['id'] in seen:
                continue  # TMDB can repeat a film across page boundaries
            seen.add(movie['id'])
            poster_path = movie.get('poster_path')
            candidates.append({
                'tmdb_id': movie['id'],
                'title': movie['title'],
                'poster': f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else '',
                'release_date': movie.get('release_date', ''),
                'overview': movie.get('overview', ''),
                'genres': [TMDB_GENRE_MAP[gid] for gid in movie.get('genre_ids', []) if gid in TMDB_GENRE_MAP],
            })
        if page >= data.get('total_pages', 1):
            break

    with ThreadPoolExecutor(max_workers=8) as pool:
        us_dates = list(pool.map(get_us_theatrical_date, [m['tmdb_id'] for m in candidates]))
    today = datetime.now().strftime('%Y-%m-%d')
    movies = []
    for movie, us_date in zip(candidates, us_dates):
        if us_date is None:
            # TMDB didn't answer: fall back to the primary release date rather
            # than drop the film over an outage.
            if _is_current_release(movie['release_date']):
                movies.append({**movie, 'us_release_date': ''})
        elif us_date and us_date <= today and _is_current_release(us_date):
            movies.append({**movie, 'us_release_date': us_date})

    if movies:  # don't cache an outage
        _now_playing_cache.update(at=time.time(), movies=movies)
    return movies


def get_movie_details(tmdb_id, with_status=False):
    """Get full movie details from TMDB by ID. Returns {} on failure, or
    ({} / details, HTTP status) with with_status=True."""
    url = f"https://api.themoviedb.org/3/movie/{tmdb_id}?api_key={TMDB_API_KEY}&append_to_response=external_ids"
    data, status = _tmdb_fetch(url)
    return (data or {}, status) if with_status else (data or {})

COLLECTION_TTL = 24 * 60 * 60  # seconds; a collection gains a part a few times a decade
_collection_cache = {}  # collection id -> (fetched_at, parts)


def get_collection_parts(collection_id):
    """[(tmdb_id, release_date), ...] for every film in a TMDB collection, or
    None if TMDB couldn't be reached (so callers don't mistake an outage for
    "no earlier parts")."""
    hit = _collection_cache.get(collection_id)
    if hit and time.time() - hit[0] < COLLECTION_TTL:
        return hit[1]
    data, status = _tmdb_fetch(f"https://api.themoviedb.org/3/collection/{collection_id}?api_key={TMDB_API_KEY}")
    if status == 404:
        parts = []  # collection deleted on TMDB: treat as a standalone film
    elif not data:
        return None
    else:
        parts = [(p.get('id'), p.get('release_date')) for p in data.get('parts', [])]
    _collection_cache[collection_id] = (time.time(), parts)
    return parts

def get_movie_page(tmdb_id, cast_limit=6):
    """Everything the movie page shows, from one TMDB call (details + credits).
    Returns (page or None, HTTP status or None)."""
    url = (f"https://api.themoviedb.org/3/movie/{tmdb_id}?api_key={TMDB_API_KEY}"
           f"&append_to_response=credits")
    data, status = _tmdb_fetch(url)
    if not data:
        return None, status
    credits = data.get('credits') or {}
    poster_path = data.get('poster_path')
    vote_count = data.get('vote_count', 0)
    return {
        'tmdb_id': data['id'],
        'title': data.get('title', ''),
        'poster': f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else '',
        'release_date': data.get('release_date', ''),
        'overview': data.get('overview', ''),
        'genres': [g['name'] for g in data.get('genres', [])],
        'cast': [a['name'] for a in credits.get('cast', [])[:cast_limit]],
        'director': next((m['name'] for m in credits.get('crew', []) if m.get('job') == 'Director'), None),
        'budget': data.get('budget', 0),
        'runtime': data.get('runtime', 0),
        # A handful of votes is noise; only surface the rating once it means something.
        'vote_average': round(data.get('vote_average', 0), 1) if vote_count > 50 else None,
    }, 200

def get_title_page(imdb_id, with_status=False):
    """Fetch and parse a film's Box Office Mojo title page. Returns None on any
    failure, or (page or None, HTTP status or None) with with_status=True, so
    callers can tell "Mojo has no page for this film" (404) from "Mojo is down
    or blocking us". Pass the page to get_opening_weekend / get_weekly_grossing
    so a prediction downloads it once instead of once per helper."""
    url = f"https://www.boxofficemojo.com/title/{imdb_id}/"
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
    except requests.RequestException as e:
        print(f"[mojo] title-page request failed for {imdb_id}: {e}")
        return (None, None) if with_status else None
    page = BeautifulSoup(response.text, 'html.parser') if response.status_code == 200 else None
    return (page, response.status_code) if with_status else page

def get_mojo_page(path):
    """Any Box Office Mojo page by path (e.g. a release group), parsed.
    None on any failure."""
    try:
        response = requests.get(f"https://www.boxofficemojo.com{path}", headers=HEADERS, timeout=10)
    except requests.RequestException as e:
        print(f"[mojo] request failed for {path}: {e}")
        return None
    return BeautifulSoup(response.text, 'html.parser') if response.status_code == 200 else None

def get_opening_weekend(imdb_id, title_page=None):
    """Scrape opening weekend from Box Office Mojo. Returns None on any failure."""
    soup = title_page if title_page is not None else get_title_page(imdb_id)
    if soup is None:
        return None
    all_spans = soup.find_all('span')
    for i, span in enumerate(all_spans):
        if span.get_text(strip=True) == 'Domestic Opening':
            for j in range(i+1, min(i+5, len(all_spans))):
                if 'money' in all_spans[j].get('class', []):
                    value = all_spans[j].get_text().strip().replace('$','').replace(',','')
                    try:
                        return int(value)
                    except ValueError:
                        return None
    return None

def get_weekly_grossing(imdb_id, title_page=None):
    """Scrape weekly grossing data from Box Office Mojo. Returns None on any failure."""
    soup = title_page if title_page is not None else get_title_page(imdb_id)
    if soup is None:
        return None
    try:
        release_links = [a['href'] for a in soup.find_all('a', href=True)
                         if '/release/' in a['href'] and 'weekend' in a['href']]
        if not release_links:
            return None

        match = re.search(r'rl\d+', release_links[0])
        if not match:
            return None
        release_id = match.group()
        weekend_url = f"https://www.boxofficemojo.com/release/{release_id}/weekend/"
        time.sleep(0.5)
        response2 = requests.get(weekend_url, headers=HEADERS, timeout=10)
        if response2.status_code != 200:
            return None

        soup2 = BeautifulSoup(response2.text, 'html.parser')
        tables = soup2.find_all('table')
        if not tables:
            return None

        return pd.read_html(StringIO(str(tables[0])))[0]
    except (requests.RequestException, ValueError) as e:
        print(f"[mojo] weekly-grossing scrape failed for {imdb_id}: {e}")
        return None

def parse_and_fit_decay(df_weekly):
    """Parse Box Office Mojo's weekend table and fit an exponential decay curve.

    Returns None (rather than raising) when the table can't be parsed or the fit
    isn't meaningful, so a Mojo layout change or a thin run costs the chart, not
    the whole prediction. Mojo's table has two "Weekend" headers: pandas names
    the gross column 'Weekend' and the weekend-number column 'Weekend.1'.
    """
    try:
        df = df_weekly[df_weekly['Weekend.1'].apply(lambda x: str(x).isdigit())].copy()
        df['gross'] = df['Weekend'].astype(str).str.replace('[$,]', '', regex=True).astype(float)
        df['week'] = df['Weekend.1'].astype(int) - 1
    except (KeyError, ValueError, TypeError, AttributeError) as e:
        print(f"[mojo] weekend table not in the expected format: {e}")
        return None

    weeks = df['week'].values
    gross = df['gross'].values
    if len(weeks) < 2 or gross[0] <= 0:
        return None  # need at least two weekends to fit a decay

    def decay_func(t, opening, lam):
        return opening * np.exp(-lam * t)

    try:
        params, _ = curve_fit(decay_func, weeks, gross, p0=[gross[0], 0.3], maxfev=5000)
    except (RuntimeError, ValueError) as e:
        print(f"[mojo] decay fit failed: {e}")
        return None
    opening, lam = params
    # A non-decaying fit (flat or growing run) has no meaningful half-life.
    if not np.isfinite(lam) or lam <= 0:
        return None

    weeks_smooth = np.linspace(0, max(weeks), 200)
    return {
        'weeks': df['week'].tolist(),
        'actual_gross': gross.tolist(),
        'fitted_weeks': weeks_smooth.tolist(),
        'fitted_gross': (opening * np.exp(-lam * weeks_smooth)).tolist(),
        'decay_rate': round(float(lam), 3),
        'half_life': round(float(np.log(2) / lam), 1),
        'opening_weekend': round(float(opening))
    }


def get_franchise_features(details):
    """model_lib.FRANCHISE_FEATURES for a film, from its TMDB details. Raises
    ConnectionError if the collection lookup fails, since guessing "not a
    sequel" would quietly skew the prediction."""
    collection = details.get('belongs_to_collection') or {}
    cid = collection.get('id')
    parts = get_collection_parts(cid) if cid else []
    if parts is None:
        raise ConnectionError(f"TMDB collection {cid} unavailable")
    return franchise_row(details.get('release_date'), cid, parts, details.get('id'))
