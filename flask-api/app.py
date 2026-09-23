from flask import Flask, jsonify, request
from flask_cors import CORS
import joblib
import pandas as pd
import numpy as np
from scraper import get_now_playing, get_us_theatrical_date, get_movie_details, get_title_page, get_opening_weekend, get_weekly_grossing, parse_and_fit_decay, get_movie_page, get_franchise_features, MAX_RELEASE_AGE_DAYS
from model_lib import FRANCHISE_FEATURES
from datetime import datetime, timezone, timedelta
from supabase import create_client
import os
import time
import json
import hmac
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Allowed browser origins come from the environment so the deployed frontend
# (e.g. the Vercel URL) can be whitelisted without a code change. Comma-separated;
# defaults to local dev.
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv('ALLOWED_ORIGINS', 'http://localhost:3000').split(',') if o.strip()
]
CORS(app, origins=ALLOWED_ORIGINS)

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

model = joblib.load('models/box_office_model_final.pkl')
# A feature snapshot keeps every column any model has used (so a later model
# can be retrained on it); each model reads the subset it was trained on.
# Models before MultiplierModel don't carry their list and use the original 26.
BASE_FEATURES = joblib.load('models/feature_columns_final.pkl')
SNAPSHOT_COLUMNS = BASE_FEATURES + FRANCHISE_FEATURES
MODEL_FEATURES = getattr(model, 'features', BASE_FEATURES)


def score(feature_row):
    """The current model's predicted total for a feature row, in dollars."""
    return float(model.predict(feature_row.reindex(columns=MODEL_FEATURES, fill_value=0))[0])

MAJOR_STUDIOS = ['Warner Bros', 'Disney', 'Marvel', 'Universal', 'Paramount', 'Sony', 'Legendary', 'Columbia']
GENRES = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
          'Drama', 'Family', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Science Fiction', 'Thriller']

# How long a prediction stays cached. A complete result (with a decay curve) is
# good for a week; a partial one (decay scrape failed / not enough weekends yet)
# is retried on a much shorter TTL so a transient failure doesn't stick.
FULL_TTL = timedelta(days=7)
DECAY_RETRY_TTL = timedelta(hours=6)

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


def store_features(tmdb_id, feature_row):
    """Best-effort snapshot of the prediction-time features for later retraining.
    Silently no-ops if the `features` column doesn't exist yet (migration not run),
    so predictions keep working regardless."""
    try:
        supabase.table('movies').update({'features': features_to_json(feature_row)}) \
            .eq('tmdb_id', tmdb_id).execute()
    except Exception as e:
        print(f"[features] snapshot skipped for {tmdb_id}: {e}")

def complete_snapshot(movie):
    """Bring a film's feature snapshot up to SNAPSHOT_COLUMNS and store it:
    add the columns introduced after it was taken (franchise, release year),
    or build it outright for a row cached before snapshots existed. Runs once
    per film instead of on every read. Raises if TMDB can't be reached."""
    details = get_movie_details(movie['tmdb_id'])
    if not details:
        raise ConnectionError(f"TMDB details unavailable for {movie['tmdb_id']}")
    if movie.get('features'):
        feats = {**movie['features'], **get_franchise_features(details)}
    else:
        feats = features_to_json(build_feature_row(details, movie['opening_weekend']))
    supabase.table('movies').update({'features': feats}).eq('tmdb_id', movie['tmdb_id']).execute()
    movie['features'] = feats
    return feats


def live_prediction(movie):
    """The prediction to show for a cached movie row.

    For a film still in theaters, re-run the *current* model on the stored
    feature snapshot (milliseconds, no scraping), so a promoted model takes
    effect everywhere at once instead of films drifting over as their 7-day
    cache expires. A finished run keeps the prediction it was settled with,
    since that's the claim the Ledger holds the model to."""
    stored = movie.get('predicted_revenue')
    feats = movie.get('features') or {}
    if movie.get('is_in_theaters') is False or not movie.get('opening_weekend'):
        return stored
    try:
        if any(c not in feats for c in MODEL_FEATURES):
            feats = complete_snapshot(movie)
        return round(score(pd.DataFrame([feats])))
    except Exception as e:
        print(f"[predict] live re-score failed for {movie.get('tmdb_id')}: {e}")
        return stored


@app.route('/health', methods=['GET'])
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
_unpriceable = {}  # tmdb id -> marked at


def mark_unpriceable(tmdb_id, code):
    if code == 'no_us_release':
        _unpriceable[tmdb_id] = time.time()
    elif code == 'no_opening_weekend':
        us_date = get_us_theatrical_date(tmdb_id)
        try:
            opened = datetime.strptime(us_date or '', '%Y-%m-%d').replace(tzinfo=timezone.utc)
        except ValueError:
            return
        if (datetime.now(timezone.utc) - opened).days > OPENING_GRACE_DAYS:
            _unpriceable[tmdb_id] = time.time()


def is_unpriceable(tmdb_id):
    marked = _unpriceable.get(tmdb_id)
    return marked is not None and time.time() - marked < UNPRICEABLE_TTL


@app.route('/api/now-playing', methods=['GET'])
def now_playing():
    movies = [m for m in get_now_playing() if not is_unpriceable(m['tmdb_id'])]
    return jsonify(movies)

@app.route('/api/movie/<int:tmdb_id>', methods=['GET'])
def movie(tmdb_id):
    """One film's page data. Works for any TMDB id, not just now-playing, so
    films linked from the Ledger (whose runs have ended) still resolve."""
    page, status = get_movie_page(tmdb_id)
    if status == 404:
        return jsonify({'error': 'Movie not found.', 'code': 'not_found'}), 404
    if not page:
        return jsonify({'error': 'TMDB is not responding.', 'code': 'tmdb_unavailable'}), 503
    return jsonify(page)

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

        weekly_rows = []
        if imdb_id:
            weekly_rows = supabase.table('weekly_gross').select('*') \
                .eq('imdb_id', imdb_id).order('week').execute().data or []
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

        base = {
            'title': movie['title'],
            'predicted_revenue': predicted,
            'opening_weekend': movie['opening_weekend'],
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
        if has_decay and age < FULL_TTL:
            return {
                **base,
                'decay_curve': decay_curve_from_db(weekly_rows, movie['decay_rate'], movie.get('half_life')),
            }, 200

        # Prediction cached without a decay curve is *partial*. Don't serve a
        # stuck N/A for a week — retry just the weekly-grossing scrape on a
        # short TTL (the opening weekend and model output are still valid).
        if not has_decay and age < FULL_TTL:
            if age < DECAY_RETRY_TTL:
                # Retried recently — avoid hammering Box Office Mojo on reloads.
                return {**base, 'decay_curve': None}, 200

            decay_data = None
            if imdb_id:
                weekly_data = get_weekly_grossing(imdb_id)
                decay_data = parse_and_fit_decay(weekly_data) if weekly_data is not None else None

            update = {'last_scraped': now.isoformat()}
            if decay_data:
                update['decay_rate'] = decay_data['decay_rate']
                update['half_life'] = decay_data['half_life']
                supabase.table('weekly_gross').delete().eq('imdb_id', imdb_id).execute()
                supabase.table('weekly_gross').insert([
                    {'imdb_id': imdb_id, 'week': w, 'gross': int(g)}
                    for w, g in zip(decay_data['weeks'], decay_data['actual_gross'])
                ]).execute()
            supabase.table('movies').update(update).eq('tmdb_id', tmdb_id).execute()

            return {**base, 'decay_curve': decay_data}, 200

        # else: stale beyond FULL_TTL → fall through to a full re-scrape below,
        # keeping the old result to serve if the refresh fails.
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
            return stale, 200
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
    if run_age_days(details) < 0:
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

    try:
        feature_row = build_feature_row(details, opening_weekend)
        predicted_revenue = score(feature_row)
    except ConnectionError as e:
        print(f"[predict] {e}")
        return fail('tmdb_unavailable', 'TMDB is not responding.', 503)
    except (KeyError, ValueError) as e:
        # Malformed/incomplete TMDB details (e.g. missing release_date).
        print(f"[predict] feature build failed for {tmdb_id}: {e}")
        return fail('insufficient_data', 'TMDB is missing details the model needs.', 422)

    weekly_data = get_weekly_grossing(imdb_id, title_page)
    decay_data = parse_and_fit_decay(weekly_data) if weekly_data is not None else None

    # Store in Supabase. Only a current release is tracked as a run
    # (is_in_theaters True, so the weekly capture will settle it). Opening an
    # older film's page still caches its numbers, with is_in_theaters NULL,
    # so it never reaches the Ledger with a prediction made after its run.
    # A row that is already tracked stays tracked.
    was_tracked = bool(cached.data) and cached.data[0].get('is_in_theaters') is True
    tracked = was_tracked or 0 <= run_age_days(details) <= MAX_RELEASE_AGE_DAYS
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
    }
    supabase.table('movies').upsert(movie_record).execute()
    store_features(tmdb_id, feature_row)

    if decay_data:
        weekly_records = [
            {'imdb_id': imdb_id, 'week': w, 'gross': int(g)}
            for w, g in zip(decay_data['weeks'], decay_data['actual_gross'])
        ]
        supabase.table('weekly_gross').delete().eq('imdb_id', imdb_id).execute()
        supabase.table('weekly_gross').insert(weekly_records).execute()

    return {
        'title': details.get('title'),
        'predicted_revenue': round(predicted_revenue),
        'opening_weekend': opening_weekend,
        'decay_curve': decay_data,
        'cached': False
    }, 200


@app.route('/api/predict', methods=['POST'])
def predict():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or 'tmdb_id' not in data:
        return jsonify({'error': 'Request body must be JSON with a "tmdb_id".', 'code': 'bad_request'}), 400
    try:
        tmdb_id = int(data['tmdb_id'])
    except (TypeError, ValueError):
        return jsonify({'error': '"tmdb_id" must be an integer.', 'code': 'bad_request'}), 400

    try:
        payload, status = predict_for(tmdb_id)
    except Exception as e:
        # Last-resort guard: never leak a stack trace to the client.
        print(f"[predict] unexpected error for {tmdb_id}: {e}")
        return jsonify({'error': 'Something went wrong generating the prediction.', 'code': 'internal'}), 500
    return jsonify(payload), status

@app.route('/api/leaderboard', methods=['GET'])
def leaderboard():
    now_playing = get_now_playing()
    if not now_playing:
        return jsonify([])

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
    return jsonify(results)


# Poster + genres for finished films, which aren't in now-playing so they
# need a TMDB lookup each. They never change once a run is settled, so keep them
# in-process for a day instead of refetching the whole Ledger on every request.
ART_TTL = timedelta(hours=24)
_art_cache = {}  # tmdb_id -> (fetched_at, (poster, genres))


def _fetch_art(tid):
    details = get_movie_details(tid)
    path = details.get('poster_path')
    poster = f"https://image.tmdb.org/t/p/w500{path}" if path else ''
    return poster, [g['name'] for g in details.get('genres', [])], bool(details)


def finished_art(tmdb_ids):
    """{tmdb_id: (poster, genres)}, from cache or fetched in parallel."""
    now = datetime.now(timezone.utc)
    out, missing = {}, []
    for tid in tmdb_ids:
        hit = _art_cache.get(tid)
        if hit and now - hit[0] < ART_TTL:
            out[tid] = hit[1]
        else:
            missing.append(tid)
    if missing:
        with ThreadPoolExecutor(max_workers=8) as pool:
            for tid, (poster, genres, ok) in zip(missing, pool.map(_fetch_art, missing)):
                out[tid] = (poster, genres)
                if ok:  # don't cache a TMDB failure for a day
                    _art_cache[tid] = (now, (poster, genres))
    return out


@app.route('/api/finished', methods=['GET'])
def finished():
    """Movies whose theatrical run has ended and we predicted for, with the real
    total revenue (TMDB `revenue`, captured by /api/refresh-finished) so the
    prediction error is measured in the same unit the model was trained on.
    Sorted by largest absolute miss first."""
    try:
        cached = supabase.table('movies').select('tmdb_id,title,predicted_revenue,actual_revenue') \
            .eq('is_in_theaters', False).execute()
    except Exception:
        return jsonify([])

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
        })

    results.sort(key=lambda x: abs(x['predicted_revenue'] - x['actual_revenue']), reverse=True)
    return jsonify(results)


def capture_finished_runs():
    """Detect movies whose run has ended and capture their real revenue.

    A predicted movie is 'finished' once it drops out of TMDB now-playing AND
    TMDB has populated its total `revenue`. We store that revenue as the ground
    truth (matching the training label's unit) plus a feature snapshot, building
    the labeled dataset a future retrain will learn from. Safe to call repeatedly
    (e.g. from a weekly job); movies awaiting a TMDB revenue update stay pending.

    Returns a summary dict (with an 'error' key on failure). Standalone-safe:
    used by both the HTTP endpoint and the scheduled capture_finished.py job."""
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

        try:
            details = get_movie_details(tid)
        except Exception:
            continue
        revenue = details.get('revenue') or 0

        # Leaving the now-playing pages isn't proof the run is over (a film can
        # slide off page 2 mid-run), and TMDB's `revenue` fills in *during* the
        # run, so an early capture records a partial total. Require a minimum
        # run length before settling.
        if run_age_days(details) < MIN_RUN_DAYS or revenue <= 0:
            pending += 1  # retry on a later run
            continue

        # Settle against the prediction the site was showing (current model),
        # which may be newer than the stored value if a model was promoted.
        predicted = live_prediction(movie)
        update = {
            'is_in_theaters': False,
            'actual_revenue': int(revenue),
            'finished_at': now.isoformat(),
            'predicted_revenue': predicted,
        }
        # Backfill a feature snapshot if the prediction predates feature capture.
        if not movie.get('features') and movie.get('opening_weekend'):
            try:
                update['features'] = features_to_json(build_feature_row(details, movie['opening_weekend']))
            except Exception:
                pass

        try:
            supabase.table('movies').update(update).eq('tmdb_id', tid).execute()
        except Exception as e:
            return {'error': f'update failed (did you run the migration?): {e}'}

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


def run_age_days(details):
    try:
        released = datetime.strptime(details.get('release_date', ''), '%Y-%m-%d').replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return -1
    return (datetime.now(timezone.utc) - released).days


def refresh_settled_revenue():
    """TMDB keeps revising `revenue` after a run ends (late territories,
    corrections). Pull settled films' ground truth up to TMDB's latest figure
    so the Ledger and retraining labels don't freeze a partial total. Only ever
    raises a figure, and only within a year of release. Returns titles updated."""
    try:
        rows = supabase.table('movies').select('tmdb_id,title,actual_revenue') \
            .eq('is_in_theaters', False).execute().data or []
    except Exception as e:
        print(f"[capture] revenue refresh skipped: {e}")
        return []
    updated = []
    for movie in rows:
        details = get_movie_details(movie['tmdb_id'])
        latest = details.get('revenue') or 0
        if not details or run_age_days(details) > 365 or latest <= (movie.get('actual_revenue') or 0):
            continue
        try:
            supabase.table('movies').update({'actual_revenue': int(latest)}) \
                .eq('tmdb_id', movie['tmdb_id']).execute()
            updated.append(movie['title'])
        except Exception as e:
            print(f"[capture] revenue refresh failed for {movie['title']}: {e}")
    return updated


# Shared secret for the admin-only endpoints. Unset means those endpoints are
# disabled entirely, so a deploy that forgets it fails closed, not open.
ADMIN_TOKEN = os.getenv('ADMIN_TOKEN', '')


def is_admin(req):
    if not ADMIN_TOKEN:
        return False
    supplied = req.headers.get('Authorization', '').removeprefix('Bearer ').strip()
    return hmac.compare_digest(supplied, ADMIN_TOKEN)


@app.route('/api/refresh-finished', methods=['POST'])
def refresh_finished():
    # Each call fans out to TMDB for every tracked film and writes to Supabase,
    # so it is not open to the public. The scheduled job calls
    # capture_finished_runs() directly and doesn't need this endpoint at all.
    if not is_admin(request):
        return jsonify({'error': 'Unauthorized.'}), 401
    result = capture_finished_runs()
    return jsonify(result), (500 if 'error' in result else 200)


if __name__ == '__main__':
    # Local dev entrypoint only. In production the app is served by gunicorn
    # (see Procfile), which imports the module-level `app` and never runs this.
    # debug defaults OFF; opt in locally with FLASK_DEBUG=1.
    debug = os.getenv('FLASK_DEBUG', '').lower() in ('1', 'true', 'yes')
    port = int(os.getenv('PORT', '5000'))
    app.run(debug=debug, host='0.0.0.0', port=port)