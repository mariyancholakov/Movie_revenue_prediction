from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import joblib
import pandas as pd
import numpy as np
from scraper import get_now_playing, get_us_theatrical_date, get_movie_details, get_title_page, get_opening_weekend, get_weekly_grossing, parse_and_fit_decay, get_movie_page, get_franchise_features, get_mojo_page, MAX_RELEASE_AGE_DAYS, NOW_PLAYING_TTL, TMDB_API_KEY, _is_current_release, _tmdb_get
from model_lib import FRANCHISE_FEATURES, MAX_STAGE, RUN_FACTS, RunModel, credit_ids, run_weeks, track_records
from mojo_parse import film_facts, original_group_path, original_release_totals, performance_totals, weekend_table
import dataset
from ttl_cache import MISSING, TTLCache
import ranges
from datetime import datetime, timezone, timedelta
from supabase import create_client
import os
import time
import hmac
import ipaddress
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Allowed browser origins come from the environment so the deployed frontend
# (e.g. the Vercel URL) can be whitelisted without a code change. Comma-separated;
# defaults to local dev.
ALLOWED_ORIGINS = [
    # A browser's Origin never ends in '/', so a pasted URL with one would never match.
    o.strip().rstrip('/') for o in os.getenv('ALLOWED_ORIGINS', 'http://localhost:3000').split(',') if o.strip()
]
CORS(app, origins=ALLOWED_ORIGINS)

# Behind a host's proxies the socket address is the proxy's, not the visitor's.
# CLIENT_IP_HEADER names a header the edge sets to the visitor's IP and
# overwrites if a client sends it: CF-Connecting-IP on Render, whose edge is
# Cloudflare (X-Forwarded-For there has a varying number of hops). Unset, as in
# local dev, the socket address is used.
CLIENT_IP_HEADER = os.getenv('CLIENT_IP_HEADER', '').strip()


def client_ip():
    if CLIENT_IP_HEADER:
        ip = request.headers.get(CLIENT_IP_HEADER, '').strip()
        if ip:
            return ip
    return get_remote_address()


# The frontend's server (Vercel) fetches film pages for their link previews
# from a few shared addresses, so counted per IP it would share one visitor's
# allowance with every other site there. It sends INTERNAL_API_KEY in
# X-Internal-Key and is counted on its own, with a higher limit. Unset (local
# dev), no request is internal.
INTERNAL_API_KEY = os.getenv('INTERNAL_API_KEY', '').strip()
VISITOR_LIMIT = '120 per minute'
INTERNAL_LIMIT = '1200 per minute'


def is_internal():
    key = request.headers.get('X-Internal-Key', '')
    return bool(INTERNAL_API_KEY) and hmac.compare_digest(key.encode(), INTERNAL_API_KEY.encode())


def rate_key():
    """Who a request counts against. An IPv6 address is counted by its /64:
    one connection is handed a whole /64, so each address in it would
    otherwise get its own allowance."""
    if is_internal():
        return 'internal'
    ip = client_ip()
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if addr.version == 6:
        if addr.ipv4_mapped:
            return str(addr.ipv4_mapped)
        return str(ipaddress.ip_network(f'{addr}/64', strict=False))
    return ip


# Per-client request limits. A prediction for a film not yet cached scrapes
# TMDB and Box Office Mojo, and a flood of those could get the server's IP
# blocked by Mojo, so /api/predict is held tighter than the reads. Counters
# live in memory, per gunicorn worker (hence one worker in the Procfile).
limiter = Limiter(
    rate_key,
    app=app,
    default_limits=[lambda: INTERNAL_LIMIT if is_internal() else VISITOR_LIMIT],
    storage_uri='memory://',
    headers_enabled=True,
)


@app.errorhandler(429)
def rate_limited(e):
    return jsonify({'error': 'Too many requests. Try again in a minute.', 'code': 'rate_limited'}), 429


# The three lists every page reads change a few times a day at most. Letting
# the browser keep them for a minute (and show a stale copy while it fetches a
# fresh one) makes reopening the site on a phone, or moving between the tabs,
# instant. Only successful answers are kept; an error is never cached.
BROWSER_CACHED = ('/api/now-playing', '/api/leaderboard', '/api/finished')


@app.after_request
def let_browsers_keep_lists(response):
    if request.path in BROWSER_CACHED and response.status_code == 200:
        response.headers['Cache-Control'] = 'public, max-age=60, stale-while-revalidate=600'
    return response

SUPABASE_KEY = os.getenv('SUPABASE_KEY', '')
if SUPABASE_KEY.startswith('sb_publishable_'):
    # The publishable key is meant to be public. The API needs the secret key
    # (sb_secret_…), which bypasses RLS; with RLS enabled (migrations/002)
    # a publishable key can neither read nor write.
    print("WARNING: SUPABASE_KEY is a publishable key; use the secret key (sb_secret_…) server-side.")
supabase = create_client(os.getenv('SUPABASE_URL'), SUPABASE_KEY)
try:
    test = supabase.table('movies').select('count').execute()
    print("Supabase connected successfully")
except Exception as e:
    print(f"Supabase connection error: {e}")

# MODEL_PATH lets a candidate be tried against live films before promotion.
model = joblib.load(os.getenv('MODEL_PATH', 'models/box_office_model_final.pkl'))
# A feature snapshot keeps every column any model has used (so a later model
# can be retrained on it); each model reads the subset it was trained on.
# The original 26 TMDB columns are the fallback for a model that doesn't list
# its own.
BASE_FEATURES = joblib.load('models/feature_columns_final.pkl')
SNAPSHOT_COLUMNS = BASE_FEATURES + FRANCHISE_FEATURES
IS_RUN_MODEL = isinstance(model, RunModel)
# How far a call can land from the final total (ranges.py); None disables ranges.
RANGES = ranges.load() if IS_RUN_MODEL else None
# The snapshot keys the current model reads. RunModel also reads the Box
# Office Mojo facts, track records and the weekends reported so far.
MODEL_FEATURES = model.inputs if IS_RUN_MODEL else getattr(model, 'features', BASE_FEATURES)
# Snapshot keys the explain endpoint shows (the weekly run is in decay_curve).
SHOWN_FEATURES = [c for c in MODEL_FEATURES if c != 'weeks']


def score(feats, stage=None):
    """The current model's predicted total for a feature snapshot (dict), in
    dollars. `stage` asks RunModel for the forecast after that many US
    weekends (1 = the opening-weekend call) instead of the latest one."""
    if IS_RUN_MODEL:
        return float(model.predict([feats], stage=stage)[0])
    row = pd.DataFrame([feats]).reindex(columns=MODEL_FEATURES, fill_value=0)
    return float(model.predict(row)[0])

MAJOR_STUDIOS = ['Warner Bros', 'Disney', 'Marvel', 'Universal', 'Paramount', 'Sony', 'Legendary', 'Columbia']
GENRES = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
          'Drama', 'Family', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Science Fiction', 'Thriller']

# How long a prediction stays cached. A complete result (with a decay curve) is
# good for a week; a partial one (decay scrape failed / not enough weekends yet)
# is retried on a much shorter TTL so a transient failure doesn't stick.
FULL_TTL = timedelta(days=7)
DECAY_RETRY_TTL = timedelta(hours=6)
# Box Office Mojo posts a weekend's actuals on the Monday after; they're in
# by Tuesday 00:00 UTC. A run in theaters is refreshed once each new weekend
# is posted, so its forecast moves weekly instead of whenever FULL_TTL lapses.
WEEKEND_POSTED_WEEKDAY = 1  # Tuesday


def weekend_posted_since(then, now):
    """Whether a US weekend's actuals have been posted between `then` and `now`."""
    days_back = (now.weekday() - WEEKEND_POSTED_WEEKDAY) % 7
    posted = (now - timedelta(days=days_back)).replace(hour=0, minute=0, second=0, microsecond=0)
    return then < posted

# A run must be at least this old before it can be settled as finished. By
# week 12 nearly all of a typical theatrical gross is in.
MIN_RUN_DAYS = 84


def build_fitted_curve(weeks, gross, decay_rate):
    """Reconstruct the fitted exponential-decay curve from a stored decay rate,
    so cached predictions render the same model curve as freshly-scraped ones.

    Only the rate is stored, not the fitted amplitude, but with the rate fixed
    the least-squares amplitude has a closed form:
        A = sum(g_t * e^(-lam t)) / sum(e^(-2 lam t))
    which is the amplitude the original joint fit landed on. (Anchoring to the
    first weekend instead drew a visibly different curve on cached loads.)"""
    if not weeks or decay_rate is None:
        return [], []
    max_w = max(weeks)
    if max_w <= 0:
        return [], []
    t = np.asarray(weeks, dtype=float)
    basis = np.exp(-decay_rate * t)
    amplitude = float(np.dot(gross, basis) / np.dot(basis, basis))
    xs = np.linspace(0, max_w, 200)
    ys = amplitude * np.exp(-decay_rate * xs)
    return xs.tolist(), ys.tolist()


def stored_weeks(imdb_id):
    """A film's stored US weekend grosses, one row per weekend. Runs stored
    before the parser dropped Box Office Mojo's repeated holiday rows have
    two rows at some weekends; the first written is the one to keep."""
    if not imdb_id:
        return []
    rows = supabase.table('weekly_gross').select('*').eq('imdb_id', imdb_id) \
        .order('week').order('id').execute().data or []
    seen, out = set(), []
    for r in rows:
        if r['week'] not in seen:
            seen.add(r['week'])
            out.append(r)
    return out


def decay_curve_from_db(weekly_rows, decay_rate, half_life):
    """Build the full decay_curve payload (incl. the fitted model curve) from
    stored weekly-gross rows. Returns None when there is no usable decay data."""
    if not weekly_rows or decay_rate is None:
        return None
    weeks = [r['week'] for r in weekly_rows]
    gross = [r['gross'] for r in weekly_rows]
    fitted_weeks, fitted_gross = build_fitted_curve(weeks, gross, decay_rate)
    return {
        'weeks': weeks,
        'actual_gross': gross,
        'fitted_weeks': fitted_weeks,
        'fitted_gross': fitted_gross,
        'decay_rate': decay_rate,
        'half_life': half_life,
    }

def build_feature_row(details, opening_weekend):
    """Convert TMDB movie details into model feature row"""
    release_date = datetime.strptime(details['release_date'], '%Y-%m-%d')
    month = release_date.month
    
    season_map = {12: 'Winter', 1: 'Winter', 2: 'Winter',
                  3: 'Spring', 4: 'Spring', 5: 'Spring',
                  6: 'Summer', 7: 'Summer', 8: 'Summer',
                  9: 'Fall', 10: 'Fall', 11: 'Fall'}
    season = season_map[month]
    
    genre_names = [g['name'] for g in details.get('genres', [])]
    companies = ' '.join([c['name'] for c in details.get('production_companies', [])])
    countries = ' '.join([c['name'] for c in details.get('production_countries', [])])
    
    row = {
        'runtime': details.get('runtime', 0),
        'budget': details.get('budget', 0),
        'popularity': details.get('popularity', 0),
        'release_month': month,
        'is_major_studio': int(any(s in companies for s in MAJOR_STUDIOS)),
        'is_us_production': int('United States' in countries),
        'is_english': int(details.get('original_language') == 'en'),
        'opening_weekend': opening_weekend,
        'release_season_Fall': season == 'Fall',
        'release_season_Spring': season == 'Spring',
        'release_season_Summer': season == 'Summer',
        'release_season_Winter': season == 'Winter',
    }
    
    for genre in GENRES:
        row[f'genre_{genre.lower().replace(" ", "_")}'] = int(genre in genre_names)
    row.update(get_franchise_features(details))  # may raise ConnectionError
    
    df_row = pd.DataFrame([row])
    df_row = df_row.reindex(columns=SNAPSHOT_COLUMNS, fill_value=0)
    return df_row


def features_to_json(feature_row):
    """JSON-safe dict of the model's feature row (numpy types -> native)."""
    return json.loads(feature_row.iloc[0].to_json())


def _json_safe(v):
    if isinstance(v, dict):
        return {k: _json_safe(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_json_safe(x) for x in v]
    if isinstance(v, pd.Timestamp):
        return None if pd.isna(v) else v.date().isoformat()
    if isinstance(v, np.generic):
        v = v.item()
    if isinstance(v, float) and np.isnan(v):
        return None
    return v


# The films whose outcomes director/cast track records draw on: the seed
# data plus the runs settled onto the Ledger since, reloaded now and then so
# a newly settled run counts. The seed part never changes.
HISTORY_TTL = 6 * 60 * 60
CREDIT_KEYS = ('release_date', 'director_ids', 'cast_ids')
_seed_history = None
_history = {'at': 0.0, 'frame': None}
_history_lock = threading.Lock()


def film_credits(tmdb_id, details):
    """A film's TMDB release date and director / lead-cast ids, as the
    track records read them. Raises ConnectionError if TMDB is down."""
    credits = _tmdb_get(f"https://api.themoviedb.org/3/movie/{tmdb_id}/credits?api_key={TMDB_API_KEY}")
    if credits is None:
        raise ConnectionError(f"TMDB credits unavailable for {tmdb_id}")
    directors, cast = credit_ids(credits)
    return {'release_date': details.get('release_date'), 'director_ids': directors, 'cast_ids': cast}


def settled_history(seed_ids):
    """Runs settled onto the Ledger, as history rows. Their credits live in
    the feature snapshot; one taken before snapshots kept them is filled in
    from TMDB and stored, or left out this time if TMDB can't be reached."""
    rows = supabase.table('movies').select('tmdb_id,features,actual_revenue,opening_weekend') \
        .eq('is_in_theaters', False).not_.is_('actual_revenue', 'null').execute().data or []
    out = []
    for r in rows:
        feats = r.get('features') or {}
        if int(r['tmdb_id']) in seed_ids or not r.get('opening_weekend'):
            continue
        if any(k not in feats for k in CREDIT_KEYS):
            details = get_movie_details(r['tmdb_id'])
            try:
                if not details:
                    raise ConnectionError(f"TMDB details unavailable for {r['tmdb_id']}")
                feats = {**feats, **film_credits(r['tmdb_id'], details)}
            except ConnectionError as e:
                print(f"[history] {e}")
                continue
            supabase.table('movies').update({'features': feats}).eq('tmdb_id', r['tmdb_id']).execute()
        out.append({'tmdb_id': int(r['tmdb_id']), **{k: feats.get(k) for k in CREDIT_KEYS},
                    'total': r['actual_revenue'], 'opening_weekend': r['opening_weekend']})
    return pd.DataFrame(out, columns=['tmdb_id', *CREDIT_KEYS, 'total', 'opening_weekend'])


def track_history():
    """Settled films the director/cast track records draw on: the seed data
    and the Ledger's settled runs. If Supabase can't be read, the seed alone
    until the next reload."""
    global _seed_history
    with _history_lock:
        if _history['frame'] is not None and time.time() - _history['at'] < HISTORY_TTL:
            return _history['frame']
        if _seed_history is None:
            _seed_history = dataset.history()
        try:
            settled = settled_history(set(_seed_history['tmdb_id']))
            frame = pd.concat([_seed_history, settled], ignore_index=True)
        except Exception as e:
            print(f"[history] settled runs unavailable: {e}")
            frame = _seed_history
        _history.update(at=time.time(), frame=frame)
        return frame


class MojoUnavailable(ConnectionError):
    """Box Office Mojo didn't answer for a page a snapshot needs."""


def mojo_snapshot(tmdb_id, details, title_page, weekly_data):
    """The RunModel facts for a film priced live: Box Office Mojo facts
    (theaters, MPAA, distributor, international openings, the weekends so
    far) and director/cast track records, read with the same parsers the
    training data went through (mojo_parse, model_lib.track_records).
    Raises ConnectionError rather than guess when a page it reads is
    unavailable: "no markets abroad" or "no track record" would quietly
    move the forecast, and the guess would be cached."""
    group = original_group_path(title_page)
    market_page = get_mojo_page(group) if group else title_page
    if market_page is None:
        raise MojoUnavailable(f"Box Office Mojo release group {group} unavailable")
    weeks = weekend_table(weekly_data) if weekly_data is not None else None
    facts = film_facts(title_page, market_page, weeks)
    snap = {k: facts.get(k) for k in ('open_theaters', 'mpaa', 'distributor')}
    snap['ww_to_date'] = facts.get('ww_all')  # floors the live forecast only
    for k in range(1, MAX_STAGE + 1):
        snap[f'intl_open_w{k}'] = facts.get(f'intl_open_w{k}')
        snap[f'intl_markets_w{k}'] = facts.get(f'intl_markets_w{k}')
    snap['weeks'] = weeks[dataset.WEEK_COLUMNS].to_dict('records') if weeks is not None else []

    # Kept in the snapshot so the run, once settled, joins the track records.
    credits = film_credits(tmdb_id, details)
    snap.update(credits)
    snap.update(track_records(pd.DataFrame([credits]), track_history()).iloc[0].to_dict())
    return snap


def build_snapshot(tmdb_id, details, opening_weekend, title_page, weekly_data):
    """Everything any model reads for one film, JSON-safe for storage."""
    feats = features_to_json(build_feature_row(details, opening_weekend))
    feats.update(mojo_snapshot(tmdb_id, details, title_page, weekly_data))
    return _json_safe(feats)

def complete_snapshot(movie):
    """Bring a film's feature snapshot up to what the current model reads and
    store it: add the columns introduced after it was taken (franchise,
    release year, the Box Office Mojo facts), or build it outright for a row
    cached before snapshots existed. Runs once per film instead of on every
    read. Raises if TMDB or Box Office Mojo can't be reached."""
    details = get_movie_details(movie['tmdb_id'])
    if not details:
        raise ConnectionError(f"TMDB details unavailable for {movie['tmdb_id']}")
    if movie.get('features'):
        feats = {**movie['features'], **get_franchise_features(details)}
    else:
        feats = features_to_json(build_feature_row(details, movie['opening_weekend']))
    # Any Box Office Mojo fact missing (not just the weekends, so a model
    # that reads a new one gets it) means one fresh read of Mojo.
    if IS_RUN_MODEL and any(k not in feats for k in RUN_FACTS + ['weeks']) and movie.get('imdb_id'):
        title_page = get_title_page(movie['imdb_id'])
        if title_page is None:
            raise MojoUnavailable(f"Box Office Mojo unavailable for {movie['tmdb_id']}")
        weekly = get_weekly_grossing(movie['imdb_id'], title_page)
        feats.update(mojo_snapshot(movie['tmdb_id'], details, title_page, weekly))
    feats = _json_safe(feats)
    supabase.table('movies').update({'features': feats}).eq('tmdb_id', movie['tmdb_id']).execute()
    movie['features'] = feats
    return feats


def model_snapshot(movie):
    """The film's feature snapshot, completed first (complete_snapshot) if
    the current model reads keys it lacks."""
    feats = movie.get('features') or {}
    if any(c not in feats for c in MODEL_FEATURES):
        feats = complete_snapshot(movie)
    return feats


def live_prediction(movie, stage=None):
    """The prediction to show for a cached movie row.

    For a film still in theaters, re-run the *current* model on the stored
    feature snapshot (milliseconds, no scraping), so a promoted model takes
    effect everywhere at once instead of films drifting over as their 7-day
    cache expires. A finished run keeps the prediction it was settled with,
    since that's the claim the Ledger holds the model to."""
    stored = movie.get('predicted_revenue')
    if movie.get('is_in_theaters') is False or not movie.get('opening_weekend'):
        return stored
    try:
        return round(score(model_snapshot(movie), stage=stage))
    except Exception as e:
        print(f"[predict] live re-score failed for {movie.get('tmdb_id')}: {e}")
        return stored


@app.route('/health', methods=['GET'])
@limiter.exempt
def health():
    """Lightweight liveness probe for the host's health check. Reports whether
    the model loaded and whether Supabase is reachable, but always returns 200 so
    a transient DB blip doesn't get the whole service restarted."""
    db_ok = True
    try:
        supabase.table('movies').select('count').limit(1).execute()
    except Exception:
        db_ok = False
    return jsonify({
        'status': 'ok',
        'model_loaded': model is not None,
        'db': 'ok' if db_ok else 'unreachable',
    })


# Films whose lookup proved there's nothing to predict from: no Box Office
# Mojo page, or still no opening weekend well after their US release. TMDB
# occasionally lists a US theatrical date for such a film; once a prediction
# has shown otherwise, it's left out of Now Playing for a day rather than
# offered as a dead end. In-process only, so it resets on deploy.
UNPRICEABLE_TTL = 24 * 60 * 60
OPENING_GRACE_DAYS = 10  # past this, a missing opening weekend won't appear
_unpriceable = TTLCache(UNPRICEABLE_TTL, max_size=2000)  # tmdb id -> True


def mark_unpriceable(tmdb_id, code):
    if code == 'no_us_release':
        _unpriceable.set(tmdb_id, True)
    elif code == 'no_opening_weekend':
        us_date = get_us_theatrical_date(tmdb_id)
        try:
            opened = datetime.strptime(us_date or '', '%Y-%m-%d').replace(tzinfo=timezone.utc)
        except ValueError:
            return
        if (datetime.now(timezone.utc) - opened).days > OPENING_GRACE_DAYS:
            _unpriceable.set(tmdb_id, True)


def is_unpriceable(tmdb_id):
    return _unpriceable.get(tmdb_id, False)


_showing_cache = {'at': 0.0, 'movies': None}


def _tracked_entry(tmdb_id):
    """A now-playing entry for a priced film TMDB no longer lists, or None if
    TMDB can't be reached or the film opened in the US too long ago."""
    us_date = get_us_theatrical_date(tmdb_id)
    if not us_date or not _is_current_release(us_date):
        return None
    details = get_movie_details(tmdb_id)
    if not details:
        return None
    poster_path = details.get('poster_path')
    return {
        'tmdb_id': tmdb_id,
        'title': details.get('title', ''),
        'poster': f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else '',
        'release_date': details.get('release_date', ''),
        'overview': details.get('overview', ''),
        'genres': [g['name'] for g in details.get('genres', [])],
        'us_release_date': us_date,
    }


def _settled_ids(tmdb_ids):
    """Which of these films have a settled run, already on the Ledger."""
    try:
        rows = supabase.table('movies').select('tmdb_id') \
            .eq('is_in_theaters', False).in_('tmdb_id', tmdb_ids).execute().data or []
    except Exception as e:
        print(f"[now-playing] settled films unavailable: {e}")
        return set()
    return {r['tmdb_id'] for r in rows}


def showing_now():
    """TMDB's now-playing list, minus films whose run has settled, plus every
    priced film whose run hasn't. TMDB lists only about six weeks of releases,
    so a long run (a summer tentpole) drops off it mid-run; a priced film
    stays up until capture_finished_runs settles it onto the Ledger. Leaving
    TMDB's list is that job's settling signal, so it reads get_now_playing()
    directly. TMDB can also keep listing a film after it settled; that one
    belongs on the Ledger, not here."""
    if _showing_cache['movies'] is not None and time.time() - _showing_cache['at'] < NOW_PLAYING_TTL:
        return _showing_cache['movies']
    movies = get_now_playing()
    if not movies:
        return []
    listed = {m['tmdb_id'] for m in movies}
    settled = _settled_ids(list(listed))
    movies = [m for m in movies if m['tmdb_id'] not in settled]
    try:
        tracked = supabase.table('movies').select('tmdb_id') \
            .eq('is_in_theaters', True).not_.is_('predicted_revenue', 'null').execute().data or []
    except Exception as e:
        print(f"[now-playing] tracked films unavailable: {e}")
        return movies
    extra = [r['tmdb_id'] for r in tracked if r['tmdb_id'] not in listed]
    with ThreadPoolExecutor(max_workers=8) as pool:
        movies = movies + [m for m in pool.map(_tracked_entry, extra) if m]
    _showing_cache.update(at=time.time(), movies=movies)
    return movies


# What the list endpoints answer when TMDB's now-playing list is unavailable,
# so a page shows the outage rather than an empty list.
TMDB_DOWN = {'error': 'TMDB is not responding.', 'code': 'tmdb_unavailable'}


@app.route('/api/now-playing', methods=['GET'])
def now_playing():
    movies = showing_now()
    if not movies:
        return jsonify(TMDB_DOWN), 503
    return jsonify([m for m in movies if not is_unpriceable(m['tmdb_id'])])

@app.route('/api/movie/<int:tmdb_id>', methods=['GET'])
def movie(tmdb_id):
    """One film's page data. Works for any TMDB id, not just now-playing, so
    films linked from the Ledger (whose runs have ended) still resolve."""
    page, status = get_movie_page(tmdb_id)
    if status == 404:
        return jsonify({'error': 'Movie not found.', 'code': 'not_found'}), 404
    if not page:
        return jsonify({'error': 'TMDB is not responding.', 'code': 'tmdb_unavailable'}), 503
    # When it opened in US theaters, which is when a prediction becomes possible.
    page['us_release_date'] = get_us_theatrical_date(tmdb_id) or ''
    return jsonify(page)

def store_weekly(imdb_id, decay_data):
    """Replace a film's stored US weekends with a fresh parse_and_fit_decay().
    The new rows go in before the old ones come out, so a failure between the
    two calls leaves the film with its old weekends (stored_weeks reads the
    earliest row per weekend), never with none; the next refresh clears the
    leftovers, since it removes every row that was there before it."""
    old = supabase.table('weekly_gross').select('id').eq('imdb_id', imdb_id).execute().data or []
    supabase.table('weekly_gross').insert([
        {'imdb_id': imdb_id, 'week': w, 'gross': int(g)}
        for w, g in zip(decay_data['weeks'], decay_data['actual_gross'])
    ]).execute()
    if old:
        supabase.table('weekly_gross').delete().in_('id', [r['id'] for r in old]).execute()


def final_run(imdb_id):
    """Store a settled film's complete US run and refit its decay; returns
    the movie-row fields to update ({} if Mojo can't supply it). A settled run
    is never re-scraped afterwards, and its stored weekends are otherwise only
    as fresh as the last time someone opened its page."""
    weekly = get_weekly_grossing(imdb_id) if imdb_id else None
    decay_data = parse_and_fit_decay(weekly) if weekly is not None else None
    if not decay_data:
        return {}
    store_weekly(imdb_id, decay_data)
    return {'decay_rate': decay_data['decay_rate'], 'half_life': decay_data['half_life']}


def forecast_history(feats, latest=None):
    """The forecast as it stood after each US weekend, 1..MAX_STAGE, rebuilt
    from the snapshot: each stage sees only the weekends and openings abroad
    on record by then. `latest` replaces the last one with the figure the
    page shows (the live forecast is floored at the worldwide gross to date,
    which the earlier calls must not see). Empty for older models."""
    weeks = run_weeks(feats)
    if not IS_RUN_MODEL or not weeks:
        return []
    history = [{'week': k, 'us_to_date': round(float(weeks[k - 1].get('to_date') or 0)),
                'forecast': round(score(feats, stage=k))}
               for k in range(1, min(len(weeks), MAX_STAGE) + 1)]
    if latest is not None:
        history[-1]['forecast'] = latest
    for h in history:
        h['low'], h['high'] = call_range(feats, h['forecast'], h['week'], floored=h is history[-1] and latest is not None) or (None, None)
    return history


def call_range(feats, call, stage, floored=False):
    """(low, high) where half of films like this one finished, around a
    call made after `stage` US weekends (ranges.py). The live call is floored
    at the worldwide gross to date, and so is its range. None without one."""
    span = ranges.forecast_range(RANGES, call, stage, feats.get('opening_weekend'))
    if not span:
        return None
    low, high = span
    if floored:
        to_date = round(float(feats.get('ww_to_date') or 0))
        low, high = max(low, to_date), max(high, to_date)
    return low, high


def headline_range(feats, predicted, settled):
    """The range around the figure the page leads with: the opening call for
    a settled run, the latest call for a live one."""
    try:
        weeks = len(run_weeks(feats))
        stage = 1 if settled else min(max(weeks, 1), MAX_STAGE)
        span = call_range(feats, predicted, stage, floored=not settled)
        return list(span) if span else None
    except Exception as e:
        print(f"[predict] forecast range failed: {e}")
        return None


def safe_history(feats, latest=None):
    """forecast_history, or none at all: the chart must never cost a film
    its prediction."""
    try:
        return forecast_history(feats, latest)
    except Exception as e:
        print(f"[predict] forecast history failed: {e}")
        return []


def predict_for(tmdb_id):
    """Core prediction pipeline: returns (payload_dict, status_code), honoring the
    Supabase cache. Shared by the /api/predict endpoint and the warm_cache job so
    a pre-warmed film and a live request go through exactly the same path.

    Never raises for expected external failures (TMDB/Mojo down, missing data) —
    those come back as an {'error': ...} payload with a 4xx/5xx code."""
    now = datetime.now(timezone.utc)

    # Check cache first
    cached = supabase.table('movies').select('*').eq('tmdb_id', tmdb_id).execute()
    if cached.data:
        movie = cached.data[0]
        imdb_id = movie.get('imdb_id')
        last_scraped = datetime.fromisoformat(movie['last_scraped'])
        age = now - last_scraped

        weekly_rows = stored_weeks(imdb_id)
        has_decay = movie.get('decay_rate') is not None and bool(weekly_rows)

        predicted = live_prediction(movie)
        if predicted != movie.get('predicted_revenue'):
            # Model changed since this row was written: keep the stored value in
            # step so Rankings and the eventual Ledger entry agree with the page.
            try:
                supabase.table('movies').update({'predicted_revenue': predicted}) \
                    .eq('tmdb_id', tmdb_id).execute()
            except Exception as e:
                print(f"[predict] could not store re-scored prediction for {tmdb_id}: {e}")

        # A settled run keeps its opening call as the headline; every weekend's
        # call is shown as it stood. A live run's last call is the headline.
        settled = movie.get('is_in_theaters') is False
        base = {
            'title': movie['title'],
            'predicted_revenue': predicted,
            'opening_weekend': movie['opening_weekend'],
            'forecast_history': safe_history(movie.get('features') or {}, None if settled else predicted),
            'forecast_range': headline_range(movie.get('features') or {}, predicted, settled),
            'cached': True,
        }

        # A finished run is settled: always serve the stored prediction next to
        # the real total. Re-scraping would also upsert is_in_theaters=True and
        # pull the film back out of the Ledger.
        if movie.get('is_in_theaters') is False:
            return {
                **base,
                'actual_revenue': movie.get('actual_revenue'),
                'decay_curve': decay_curve_from_db(weekly_rows, movie.get('decay_rate'), movie.get('half_life')),
            }, 200

        # Fresh + complete → serve straight from cache.
        new_weekend = movie.get('is_in_theaters') is True and weekend_posted_since(last_scraped, now)
        if has_decay and age < FULL_TTL and not new_weekend:
            return {
                **base,
                'decay_curve': decay_curve_from_db(weekly_rows, movie['decay_rate'], movie.get('half_life')),
            }, 200

        # Cached without a decay curve (fewer than two weekends so far, or a
        # run the fit can't describe) is refreshed on a short TTL instead, and
        # in full: the snapshot's weekends are what the forecast is re-made
        # from, so refreshing only the chart would freeze the forecast.
        if not has_decay and age < DECAY_RETRY_TTL:
            return {**base, 'decay_curve': None}, 200

        # else: stale → fall through to a full re-scrape below, keeping the
        # old result to serve if the refresh fails.
        stale = {
            **base,
            'decay_curve': decay_curve_from_db(weekly_rows, movie['decay_rate'], movie.get('half_life'))
            if has_decay else None,
        }
    else:
        stale = None

    def fail(code, message, status):
        """An error payload, unless an older cached result can stand in."""
        if stale:
            print(f"[predict] refresh failed for {tmdb_id} ({code}); serving the cached result")
            # Invisible to the page; lets warm_cache count a failed refresh.
            return {**stale, 'refresh_failed': True}, 200
        mark_unpriceable(tmdb_id, code)
        return {'error': message, 'code': code}, status

    # Not cached or stale — full scrape + model prediction.
    # Every error payload carries a `code`; the frontend turns each one into
    # a plain explanation (MovieDetail.tsx errorCopy).
    details, tmdb_status = get_movie_details(tmdb_id, with_status=True)
    if tmdb_status == 404:
        return fail('not_found', 'TMDB has no film with this id.', 404)
    if not details:
        return fail('tmdb_unavailable', 'TMDB is not responding.', 503)
    # Released anywhere yet: a film that opened abroad first still gets a
    # Box Office Mojo lookup, which tells its reader when it opens in the US.
    released = days_since(details.get('release_date'))
    if released is None:
        return fail('insufficient_data', 'TMDB is missing details the model needs.', 422)
    if released < 0:
        return fail('not_released', 'The film has not been released yet.', 422)
    imdb_id = details.get('external_ids', {}).get('imdb_id')
    if not imdb_id:
        return fail('no_listing', 'The film has no IMDb id, so no box-office listing.', 404)

    title_page, mojo_status = get_title_page(imdb_id, with_status=True)
    if title_page is None:
        if mojo_status == 404:
            return fail('no_us_release', 'Box Office Mojo has no page for this film.', 404)
        return fail('box_office_unavailable', 'Box Office Mojo is not responding.', 503)
    opening_weekend = get_opening_weekend(imdb_id, title_page)
    if not opening_weekend:
        return fail('no_opening_weekend', 'No US opening weekend has been reported.', 404)

    weekly_data = get_weekly_grossing(imdb_id, title_page)
    decay_data = parse_and_fit_decay(weekly_data) if weekly_data is not None else None

    try:
        feats = build_snapshot(tmdb_id, details, opening_weekend, title_page, weekly_data)
        predicted_revenue = score(feats)
    except MojoUnavailable as e:
        print(f"[predict] {e}")
        return fail('box_office_unavailable', 'Box Office Mojo is not responding.', 503)
    except ConnectionError as e:
        print(f"[predict] {e}")
        return fail('tmdb_unavailable', 'TMDB is not responding.', 503)
    except (KeyError, ValueError) as e:
        # Malformed/incomplete TMDB details (e.g. missing release_date).
        print(f"[predict] feature build failed for {tmdb_id}: {e}")
        return fail('insufficient_data', 'TMDB is missing details the model needs.', 422)
    except Exception as e:
        # Anything else (a page layout the parsers don't expect): the cached
        # result, if there is one, is better than an error.
        print(f"[predict] snapshot failed for {tmdb_id}: {e!r}")
        return fail('internal', 'Something went wrong generating the prediction.', 500)

    # Store in Supabase. Only a current release is tracked as a run
    # (is_in_theaters True, so the weekly capture will settle it). Opening an
    # older film's page still caches its numbers, with is_in_theaters NULL,
    # so it never reaches the Ledger with a prediction made after its run.
    # A row that is already tracked stays tracked.
    was_tracked = bool(cached.data) and cached.data[0].get('is_in_theaters') is True
    age = run_age_days(details)
    tracked = was_tracked or (age is not None and 0 <= age <= MAX_RELEASE_AGE_DAYS)
    movie_record = {
        'imdb_id': imdb_id,
        'tmdb_id': tmdb_id,
        'title': details.get('title'),
        'opening_weekend': opening_weekend,
        'predicted_revenue': round(predicted_revenue),
        'decay_rate': decay_data['decay_rate'] if decay_data else None,
        'half_life': decay_data['half_life'] if decay_data else None,
        'is_in_theaters': True if tracked else None,
        'last_scraped': now.isoformat(),
        'features': feats,
    }
    try:
        supabase.table('movies').upsert(movie_record).execute()
        if decay_data:
            store_weekly(imdb_id, decay_data)
    except Exception as e:
        # The fresh prediction still stands; it just isn't cached this time.
        print(f"[predict] could not store {tmdb_id}: {e}")

    return {
        'title': details.get('title'),
        'predicted_revenue': round(predicted_revenue),
        'opening_weekend': opening_weekend,
        'decay_curve': decay_data,
        'forecast_history': safe_history(feats, round(predicted_revenue)),
        'forecast_range': headline_range(feats, round(predicted_revenue), settled=False),
        'cached': False
    }, 200


@app.route('/api/predict', methods=['POST'])
@limiter.limit('10 per minute; 100 per hour')
def predict():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or 'tmdb_id' not in data:
        return jsonify({'error': 'Request body must be JSON with a "tmdb_id".', 'code': 'bad_request'}), 400
    try:
        tmdb_id = int(data['tmdb_id'])  # OverflowError: JSON's Infinity
    except (TypeError, ValueError, OverflowError):
        tmdb_id = 0
    if tmdb_id <= 0:
        return jsonify({'error': '"tmdb_id" must be a positive integer.', 'code': 'bad_request'}), 400

    try:
        payload, status = predict_for(tmdb_id)
    except Exception as e:
        # Last-resort guard: never leak a stack trace to the client.
        print(f"[predict] unexpected error for {tmdb_id}: {e}")
        return jsonify({'error': 'Something went wrong generating the prediction.', 'code': 'internal'}), 500
    return jsonify(payload), status

# Re-scoring every priced film with the model takes about two seconds, and
# every visit to the Rankings page asks for it. The ranking is kept for
# LEADERBOARD_FRESH seconds; after that a visitor is handed the kept copy at
# once while one background thread builds the next, so nobody waits on it
# unless the copy is over LEADERBOARD_STALE old (an idle server). A newly
# priced film or a promoted model shows up within a couple of minutes.
LEADERBOARD_FRESH = 120  # seconds
LEADERBOARD_STALE = 3600
_leaderboard = {'at': 0.0, 'ranked': None, 'refreshing': False}
_leaderboard_lock = threading.Lock()


def build_leaderboard():
    """The ranking of every priced film still in theaters, largest predicted
    total first; None when TMDB's now-playing list is unavailable."""
    now_playing = showing_now()
    if not now_playing:
        return None

    tmdb_ids = [m['tmdb_id'] for m in now_playing]
    poster_map  = {m['tmdb_id']: m['poster']  for m in now_playing}
    genre_map   = {m['tmdb_id']: m.get('genres', []) for m in now_playing}

    cached = supabase.table('movies').select('*').in_('tmdb_id', tmdb_ids).execute()

    results = []
    for movie in cached.data:
        # TMDB can keep listing a film after its run is settled; it belongs on
        # the Ledger then, not in the rankings of open runs.
        if movie.get('is_in_theaters') is False:
            continue
        predicted = live_prediction(movie)
        if not predicted:
            continue
        tid = movie['tmdb_id']
        results.append({
            'tmdb_id':           tid,
            'title':             movie['title'],
            'poster':            poster_map.get(tid, ''),
            'genres':            genre_map.get(tid, []),
            'opening_weekend':   movie['opening_weekend'],
            'predicted_revenue': predicted,
            'decay_rate':        movie.get('decay_rate'),
            # From the feature snapshot; 0 means TMDB has no budget on file.
            'budget':            (movie.get('features') or {}).get('budget') or None,
        })

    results.sort(key=lambda x: x['predicted_revenue'], reverse=True)
    return results


def _refresh_leaderboard():
    try:
        ranked = build_leaderboard()
        if ranked is not None:
            _leaderboard.update(at=time.time(), ranked=ranked)
    except Exception as e:
        print(f"[leaderboard] refresh failed: {e}")
    finally:
        _leaderboard['refreshing'] = False


@app.route('/api/leaderboard', methods=['GET'])
def leaderboard():
    ranked, age = _leaderboard['ranked'], time.time() - _leaderboard['at']
    if ranked is not None and age < LEADERBOARD_STALE:
        if age >= LEADERBOARD_FRESH:
            with _leaderboard_lock:
                start = not _leaderboard['refreshing']
                _leaderboard['refreshing'] = True
            if start:
                threading.Thread(target=_refresh_leaderboard, daemon=True).start()
        return jsonify(ranked)

    ranked = build_leaderboard()
    if ranked is None:
        return jsonify(TMDB_DOWN), 503
    _leaderboard.update(at=time.time(), ranked=ranked)
    return jsonify(ranked)


@app.route('/api/explain/<int:tmdb_id>', methods=['GET'])
def explain(tmdb_id):
    """How the model reached one film's number, for the How It Works page:
    the feature snapshot it read and the factors its multiplier is made of.
    Only for a priced film still in theaters (what Rankings lists), so the
    breakdown always matches the prediction shown everywhere else."""
    if not hasattr(model, 'explain'):
        return jsonify({'error': 'The current model cannot be broken down.', 'code': 'internal'}), 503
    rows = supabase.table('movies').select('*').eq('tmdb_id', tmdb_id).execute().data
    movie = rows[0] if rows else None
    if not movie or movie.get('is_in_theaters') is not True or not movie.get('opening_weekend'):
        return jsonify({'error': 'This film has no open run to explain.', 'code': 'not_found'}), 404
    try:
        feats = model_snapshot(movie)
        base, factors = model.explain(pd.DataFrame([feats]))
        predicted = round(score(feats))
    except Exception as e:
        print(f"[explain] failed for {tmdb_id}: {e}")
        return jsonify({'error': 'TMDB is not responding.', 'code': 'tmdb_unavailable'}), 503

    weekly_rows = stored_weeks(movie.get('imdb_id')) if movie.get('decay_rate') is not None else []
    return jsonify({
        'tmdb_id': tmdb_id,
        'title': movie['title'],
        'opening_weekend': movie['opening_weekend'],
        'predicted_revenue': predicted,
        'multiplier': predicted / movie['opening_weekend'],
        'base_multiplier': base,
        'factors': factors,
        'features': {k: feats.get(k, 0) for k in SHOWN_FEATURES},
        'weeks_reported': len(run_weeks(feats)),
        'decay_curve': decay_curve_from_db(weekly_rows, movie.get('decay_rate'), movie.get('half_life')),
    })

# Poster + genres for finished films, which aren't in now-playing so they
# need a TMDB lookup each. They never change once a run is settled, so keep them
# in-process for a day instead of refetching the whole Ledger on every request.
ART_TTL = 24 * 60 * 60
_art_cache = TTLCache(ART_TTL, max_size=2000)  # tmdb_id -> (poster, genres)


def _fetch_art(tid):
    details = get_movie_details(tid)
    path = details.get('poster_path')
    poster = f"https://image.tmdb.org/t/p/w500{path}" if path else ''
    return poster, [g['name'] for g in details.get('genres', [])], bool(details)


def finished_art(tmdb_ids):
    """{tmdb_id: (poster, genres)}, from cache or fetched in parallel."""
    out, missing = {}, []
    for tid in tmdb_ids:
        hit = _art_cache.get(tid)
        if hit is not MISSING:
            out[tid] = hit
        else:
            missing.append(tid)
    if missing:
        with ThreadPoolExecutor(max_workers=8) as pool:
            for tid, (poster, genres, ok) in zip(missing, pool.map(_fetch_art, missing)):
                out[tid] = (poster, genres)
                if ok:  # don't cache a TMDB failure for a day
                    _art_cache.set(tid, (poster, genres))
    return out


@app.route('/api/finished', methods=['GET'])
def finished():
    """Movies whose theatrical run has ended and we predicted for, with the
    total they settled at (settled_total, captured by the weekly job), the
    same worldwide label the model is trained on. Sorted by largest absolute
    miss first."""
    try:
        cached = supabase.table('movies').select('tmdb_id,title,predicted_revenue,actual_revenue,later_calls') \
            .eq('is_in_theaters', False).execute()
    except Exception as e:
        print(f"[finished] settled runs unavailable: {e}")
        return jsonify({'error': 'The database is not responding.', 'code': 'db_unavailable'}), 503

    rows = [m for m in (cached.data or []) if m.get('actual_revenue') and m.get('predicted_revenue')]
    art = finished_art([m['tmdb_id'] for m in rows if m.get('tmdb_id')])

    results = []
    for movie in rows:
        tid = movie.get('tmdb_id')
        poster, genres = art.get(tid, ('', []))
        results.append({
            'tmdb_id': tid,
            'title': movie.get('title'),
            'poster': poster,
            'genres': genres,
            'predicted_revenue': movie['predicted_revenue'],
            'actual_revenue': int(movie['actual_revenue']),
            'later_calls': movie.get('later_calls') or {},
        })

    results.sort(key=lambda x: abs(x['predicted_revenue'] - x['actual_revenue']), reverse=True)
    return jsonify(results)


# The later weekends the Ledger also scores, beside the opening call.
LATER_CALLS = (2, 4, 8)


def later_calls(feats):
    """A settled film's forecast as it stood after each of LATER_CALLS US
    weekends, for the weekends its run reached. Empty if it can't be scored.
    Made once, when the film settles, and stored (movies.later_calls): after
    the next retrain the model has learned this film's outcome, so scoring
    them on read would grade it on its own training data."""
    weeks = len(run_weeks(feats))
    if not IS_RUN_MODEL:
        return {}
    try:
        return {str(k): round(score(feats, stage=k)) for k in LATER_CALLS if k <= weeks}
    except Exception as e:
        print(f"[finished] later calls failed: {e}")
        return {}


def capture_finished_runs():
    """Detect movies whose run has ended and capture their real revenue.

    A predicted movie is 'finished' once it drops out of TMDB now-playing and
    is at least MIN_RUN_DAYS old. We store its settled_total() as the ground
    truth (the training label itself) plus a feature snapshot, building the
    labeled dataset a future retrain will learn from. Safe to call repeatedly
    (e.g. from a weekly job); movies with no total on record yet stay pending.

    Returns a summary dict (with an 'error' key on failure). Run by the
    scheduled capture_finished.py job."""
    now = datetime.now(timezone.utc)
    try:
        now_playing = get_now_playing()
        if not now_playing:
            # An outage would otherwise look like every film leaving theaters.
            return {'error': 'TMDB now-playing list unavailable; nothing captured.'}
        now_playing_ids = {m['tmdb_id'] for m in now_playing}
        tracked = supabase.table('movies').select('*').eq('is_in_theaters', True).execute().data or []
    except Exception as e:
        return {'error': str(e)}

    finished, pending = [], 0
    for movie in tracked:
        tid = movie.get('tmdb_id')
        if tid is None or tid in now_playing_ids:
            continue  # still playing (or unreleased)

        # Leaving the now-playing pages isn't proof the run is over (a film can
        # slide off page 2 mid-run), and grosses fill in *during* the run, so an
        # early capture records a partial total. Require a minimum run length
        # before settling.
        details = get_movie_details(tid)
        age = run_age_days(details) if details else None
        if age is None or age < MIN_RUN_DAYS:
            pending += 1  # retry on a later run
            continue
        revenue = settled_total(details, movie.get('imdb_id'))
        if revenue <= 0:
            pending += 1
            continue

        # Settle against the current model's opening-weekend call. The live
        # number is re-forecast every weekend and ends up near the real total,
        # so it would flatter the Ledger; the opening call is the claim the
        # Ledger has always held the model to. No stand-in if it can't be
        # made: the stored figure is the latest call.
        try:
            predicted = round(score(model_snapshot(movie), stage=1))
        except Exception as e:
            print(f"[capture] opening call unavailable for {movie.get('title')}: {e}")
            pending += 1
            continue
        update = {
            'is_in_theaters': False,
            'actual_revenue': int(revenue),
            'finished_at': now.isoformat(),
            'predicted_revenue': predicted,
            # By the same model, which hasn't trained on this film yet.
            'later_calls': later_calls(model_snapshot(movie)),
        }
        try:
            update.update(final_run(movie.get('imdb_id')))
        except Exception as e:
            print(f"[capture] final run not stored for {movie.get('title')}: {e}")

        try:
            supabase.table('movies').update(update).eq('tmdb_id', tid).execute()
        except Exception as e:
            return {'error': f'update failed: {e}'}

        finished.append({
            'tmdb_id': tid,
            'title': movie.get('title'),
            'predicted_revenue': predicted,
            'actual_revenue': int(revenue),
            'error_pct': round(abs(predicted - revenue) / revenue * 100, 1) if predicted else None,
        })

    return {
        'checked': len(tracked),
        'newly_finished': len(finished),
        'pending_revenue': pending,
        'finished': finished,
        'revenue_updated': refresh_settled_revenue(),
    }


def days_since(date):
    """Whole days (UTC) since a 'YYYY-MM-DD' date, or None if it doesn't parse."""
    try:
        released = datetime.strptime(date or '', '%Y-%m-%d').replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None
    return (datetime.now(timezone.utc) - released).days


def run_age_days(details):
    """Days since the film opened in US theaters: the run the model prices,
    dated the way Now Playing dates it. TMDB's `release_date` is the first
    release anywhere, which for a film that played abroad or at festivals
    first can be months earlier. Falls back to it when TMDB has no US date
    or can't be reached; None when neither is known."""
    us_date = get_us_theatrical_date(details['id']) if details.get('id') else None
    age = days_since(us_date)
    return age if age is not None else days_since(details.get('release_date'))


def settled_total(details, imdb_id):
    """The worldwide total a run is settled at: the same label the model
    trains on (dataset.clean_total), Box Office Mojo's worldwide figure for
    the original release when Mojo has real foreign grosses, else TMDB's
    `revenue`, which sometimes holds only the US gross. TMDB alone when Mojo
    can't be reached."""
    tmdb = details.get('revenue') or 0
    page = get_title_page(imdb_id) if imdb_id else None
    if page is None:
        return int(tmdb)
    totals = original_release_totals(page)
    dom, intl, ww = totals[:3] if totals else performance_totals(page)
    na = lambda v: np.nan if v is None else v
    return int(dataset.clean_total(tmdb, na(dom), na(intl), na(ww)))


def refresh_settled_revenue():
    """Grosses keep being revised after a run ends (late territories,
    corrections). Pull settled films' ground truth up to the latest settled
    total so the Ledger and retraining labels don't freeze a partial figure.
    Only ever raises a figure, and only within a year of release. Returns
    titles updated."""
    try:
        rows = supabase.table('movies').select('tmdb_id,imdb_id,title,actual_revenue') \
            .eq('is_in_theaters', False).execute().data or []
    except Exception as e:
        print(f"[capture] revenue refresh skipped: {e}")
        return []
    updated = []
    for movie in rows:
        details = get_movie_details(movie['tmdb_id'])
        age = run_age_days(details) if details else None
        if age is None or age > 365:
            continue
        latest = settled_total(details, movie.get('imdb_id'))
        if latest <= (movie.get('actual_revenue') or 0):
            continue
        try:
            supabase.table('movies').update({'actual_revenue': int(latest)}) \
                .eq('tmdb_id', movie['tmdb_id']).execute()
            updated.append(movie['title'])
        except Exception as e:
            print(f"[capture] revenue refresh failed for {movie['title']}: {e}")
    return updated


if __name__ == '__main__':
    # Local dev entrypoint only. In production the app is served by gunicorn
    # (see Procfile), which imports the module-level `app` and never runs this.
    # debug defaults OFF; opt in locally with FLASK_DEBUG=1.
    debug = os.getenv('FLASK_DEBUG', '').lower() in ('1', 'true', 'yes')
    port = int(os.getenv('PORT', '5000'))
    app.run(debug=debug, host='0.0.0.0', port=port)