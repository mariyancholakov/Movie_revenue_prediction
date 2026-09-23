import requests
from bs4 import BeautifulSoup
import pandas as pd
import numpy as np
from scipy.optimize import curve_fit
from io import StringIO
import re
import time
from dotenv import load_dotenv
import os

HEADERS = {'User-Agent': 'Mozilla/5.0 (Macintatis; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
load_dotenv()

TMDB_GENRE_MAP = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
    14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
}

TMDB_API_KEY = os.getenv('TMDB_API_KEY')

def _tmdb_get(url):
    """GET a TMDB endpoint and return parsed JSON, or None on any failure
    (network error, non-200, or unparseable body). Callers handle None so a
    TMDB outage or rate-limit becomes a graceful empty state, not a 500."""
    try:
        response = requests.get(url, timeout=10)
    except requests.RequestException as e:
        print(f"[tmdb] request failed: {e}")
        return None
    if response.status_code != 200:
        print(f"[tmdb] {response.status_code} for {url.split('?')[0]}")
        return None
    try:
        return response.json()
    except ValueError:
        print(f"[tmdb] non-JSON response for {url.split('?')[0]}")
        return None

def get_now_playing():
    """Fetch movies currently in theaters from TMDB. Returns [] on failure."""
    url = f"https://api.themoviedb.org/3/movie/now_playing?api_key={TMDB_API_KEY}&language=en-US&page=1"
    data = _tmdb_get(url)
    if not data or 'results' not in data:
        return []

    movies = []
    for movie in data['results']:
        poster_path = movie.get('poster_path')
        movies.append({
            'tmdb_id': movie['id'],
            'title': movie['title'],
            'poster': f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else '',
            'release_date': movie.get('release_date', ''),
            'overview': movie.get('overview', ''),
            'genres': [TMDB_GENRE_MAP[gid] for gid in movie.get('genre_ids', []) if gid in TMDB_GENRE_MAP],
        })
    return movies

def get_movie_details(tmdb_id):
    """Get full movie details from TMDB by ID. Returns {} on failure."""
    url = f"https://api.themoviedb.org/3/movie/{tmdb_id}?api_key={TMDB_API_KEY}&append_to_response=external_ids"
    return _tmdb_get(url) or {}

def get_movie_page(tmdb_id, cast_limit=6):
    """Everything the movie page shows, from one TMDB call (details + credits).
    Returns None on failure."""
    url = (f"https://api.themoviedb.org/3/movie/{tmdb_id}?api_key={TMDB_API_KEY}"
           f"&append_to_response=credits")
    data = _tmdb_get(url)
    if not data:
        return None
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
    }

def get_opening_weekend(imdb_id):
    """Scrape opening weekend from Box Office Mojo. Returns None on any failure."""
    url = f"https://www.boxofficemojo.com/title/{imdb_id}/"
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
    except requests.RequestException as e:
        print(f"[mojo] opening-weekend request failed for {imdb_id}: {e}")
        return None
    if response.status_code != 200:
        return None
    
    soup = BeautifulSoup(response.text, 'html.parser')
    all_spans = soup.find_all('span')
    for i, span in enumerate(all_spans):
        if span.get_text(strip=True) == 'Domestic Opening':
            for j in range(i+1, min(i+5, len(all_spans))):
                if 'money' in all_spans[j].get('class', []):
                    value = all_spans[j].get_text().strip().replace('$','').replace(',','')
                    try:
                        return int(value)
                    except:
                        return None
    return None

def get_weekly_grossing(imdb_id):
    """Scrape weekly grossing data from Box Office Mojo. Returns None on any failure."""
    main_url = f"https://www.boxofficemojo.com/title/{imdb_id}/"
    try:
        response = requests.get(main_url, headers=HEADERS, timeout=10)
        if response.status_code != 200:
            return None

        soup = BeautifulSoup(response.text, 'html.parser')
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
    """Parse weekly data and fit exponential decay curve"""
    df = df_weekly[df_weekly['Weekend.1'].apply(lambda x: str(x).isdigit())].copy()
    df['gross'] = df['Weekend'].str.replace('[$,]', '', regex=True).astype(float)
    df['week'] = df['Weekend.1'].astype(int) - 1

    weeks = df['week'].values
    gross = df['gross'].values

    def decay_func(t, opening, lam):
        return opening * np.exp(-lam * t)

    try:
        params, _ = curve_fit(decay_func, weeks, gross, p0=[gross[0], 0.3], maxfev=5000)
        opening, lam = params
        
        weeks_smooth = np.linspace(0, max(weeks), 200).tolist()
        fitted = (opening * np.exp(-lam * np.linspace(0, max(weeks), 200))).tolist()
        
        return {
            'weeks': df['week'].tolist(),
            'actual_gross': gross.tolist(),
            'fitted_weeks': weeks_smooth,
            'fitted_gross': fitted,
            'decay_rate': round(float(lam), 3),
            'half_life': round(float(np.log(2) / lam), 1),
            'opening_weekend': round(float(opening))
        }
    except:
        return None