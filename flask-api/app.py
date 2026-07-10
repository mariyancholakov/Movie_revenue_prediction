from flask import Flask, jsonify, request
from flask_cors import CORS
import joblib
import pandas as pd
import numpy as np
from scraper import get_now_playing, get_movie_details, get_opening_weekend, get_weekly_grossing, parse_and_fit_decay, get_movie_cast, get_movie_credits
from datetime import datetime, timezone, timedelta
from supabase import create_client
import os
from dotenv import load_dotenv

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000"])

load_dotenv()

supabase = create_client(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_KEY')
)
try:
    test = supabase.table('movies').select('count').execute()
    print("Supabase connected successfully")
except Exception as e:
    print(f"Supabase connection error: {e}")

model = joblib.load('models/box_office_model_final.pkl')
feature_columns = joblib.load('models/feature_columns_final.pkl')

MAJOR_STUDIOS = ['Warner Bros', 'Disney', 'Marvel', 'Universal', 'Paramount', 'Sony', 'Legendary', 'Columbia']
GENRES = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
          'Drama', 'Family', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Science Fiction', 'Thriller']

# How long a prediction stays cached. A complete result (with a decay curve) is
# good for a week; a partial one (decay scrape failed / not enough weekends yet)
# is retried on a much shorter TTL so a transient failure doesn't stick.
FULL_TTL = timedelta(days=7)
DECAY_RETRY_TTL = timedelta(hours=6)


def build_fitted_curve(weeks, gross, decay_rate):
    """Reconstruct the fitted exponential-decay curve from a stored decay rate,
    anchored to the opening-weekend gross, so cached predictions render the same
    model curve as freshly-scraped ones."""
    if not weeks or decay_rate is None:
        return [], []
    max_w = max(weeks)
    if max_w <= 0:
        return [], []
    amplitude = gross[0]
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
    
    df_row = pd.DataFrame([row])
    df_row = df_row.reindex(columns=feature_columns, fill_value=0)
    return df_row

@app.route('/api/now-playing', methods=['GET'])
def now_playing():
    movies = get_now_playing()
    return jsonify(movies)

@app.route('/api/movie/<int:tmdb_id>/cast', methods=['GET'])
def movie_cast(tmdb_id):
    cast, director = get_movie_credits(tmdb_id)
    details = get_movie_details(tmdb_id)
    vote_avg = details.get('vote_average', 0)
    vote_count = details.get('vote_count', 0)
    return jsonify({
        'cast': cast,
        'director': director,
        'budget': details.get('budget', 0),
        'runtime': details.get('runtime', 0),
        'vote_average': round(vote_avg, 1) if vote_count > 50 else None,
        'vote_count': vote_count,
    })

@app.route('/api/predict', methods=['POST'])
def predict():
    data = request.json
    tmdb_id = data['tmdb_id']
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

        base = {
            'title': movie['title'],
            'predicted_revenue': movie['predicted_revenue'],
            'opening_weekend': movie['opening_weekend'],
            'cached': True,
        }

        # Fresh + complete → serve straight from cache.
        if has_decay and age < FULL_TTL:
            return jsonify({
                **base,
                'decay_curve': decay_curve_from_db(weekly_rows, movie['decay_rate'], movie.get('half_life')),
            })

        # Prediction cached without a decay curve is *partial*. Don't serve a
        # stuck N/A for a week — retry just the weekly-grossing scrape on a
        # short TTL (the opening weekend and model output are still valid).
        if not has_decay and age < FULL_TTL:
            if age < DECAY_RETRY_TTL:
                # Retried recently — avoid hammering Box Office Mojo on reloads.
                return jsonify({**base, 'decay_curve': None})

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

            return jsonify({**base, 'decay_curve': decay_data})

        # else: stale beyond FULL_TTL → fall through to a full re-scrape below.

    # Not cached or stale — full scrape + model prediction.
    details = get_movie_details(tmdb_id)
    imdb_id = details.get('external_ids', {}).get('imdb_id')
    if not imdb_id:
        return jsonify({'error': 'Could not find IMDB ID'}), 400

    opening_weekend = get_opening_weekend(imdb_id)
    if not opening_weekend:
        return jsonify({'error': 'Could not find opening weekend data'}), 400

    feature_row = build_feature_row(details, opening_weekend)
    predicted_revenue = float(model.predict(feature_row)[0])

    weekly_data = get_weekly_grossing(imdb_id)
    decay_data = parse_and_fit_decay(weekly_data) if weekly_data is not None else None

    # Store in Supabase
    movie_record = {
        'imdb_id': imdb_id,
        'tmdb_id': tmdb_id,
        'title': details['title'],
        'opening_weekend': opening_weekend,
        'predicted_revenue': round(predicted_revenue),
        'decay_rate': decay_data['decay_rate'] if decay_data else None,
        'half_life': decay_data['half_life'] if decay_data else None,
        'is_in_theaters': True,
        'last_scraped': now.isoformat(),
    }
    supabase.table('movies').upsert(movie_record).execute()

    if decay_data:
        weekly_records = [
            {'imdb_id': imdb_id, 'week': w, 'gross': int(g)}
            for w, g in zip(decay_data['weeks'], decay_data['actual_gross'])
        ]
        supabase.table('weekly_gross').delete().eq('imdb_id', imdb_id).execute()
        supabase.table('weekly_gross').insert(weekly_records).execute()

    return jsonify({
        'title': details['title'],
        'predicted_revenue': round(predicted_revenue),
        'opening_weekend': opening_weekend,
        'decay_curve': decay_data,
        'cached': False
    })

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
        if not movie.get('predicted_revenue'):
            continue
        tid = movie['tmdb_id']
        results.append({
            'tmdb_id':           tid,
            'title':             movie['title'],
            'poster':            poster_map.get(tid, ''),
            'genres':            genre_map.get(tid, []),
            'opening_weekend':   movie['opening_weekend'],
            'predicted_revenue': movie['predicted_revenue'],
            'decay_rate':        movie.get('decay_rate'),
        })

    results.sort(key=lambda x: x['predicted_revenue'], reverse=True)
    return jsonify(results)


@app.route('/api/finished', methods=['GET'])
def finished():
    """Return movies that have finished their theatrical run and we predicted for,
    including actual total gross computed from weekly_gross table and prediction error."""
    try:
        # Select movies that have a predicted_revenue and are no longer in theaters
        cached = supabase.table('movies').select('*').eq('is_in_theaters', False).execute()
    except Exception as e:
        return jsonify([])

    if not cached.data:
        return jsonify([])

    results = []
    for movie in cached.data:
        if not movie.get('predicted_revenue'):
            continue
        tid = movie.get('tmdb_id')
        imdb_id = movie.get('imdb_id')

        # Sum weekly gross to compute actual total if available
        actual_total = None
        if imdb_id:
            weekly = supabase.table('weekly_gross').select('gross').eq('imdb_id', imdb_id).execute()
            if weekly.data:
                try:
                    actual_total = sum([r.get('gross', 0) or 0 for r in weekly.data])
                except Exception:
                    actual_total = None

        # Try to fetch poster/genres from TMDB if tmdb id present
        poster = ''
        genres = []
        if tid:
            try:
                details = get_movie_details(tid)
                poster = f"https://image.tmdb.org/t/p/w500{details.get('poster_path')}" if details.get('poster_path') else ''
                genres = [g['name'] for g in details.get('genres', [])]
            except Exception:
                poster = ''
                genres = []

        results.append({
            'tmdb_id': tid,
            'title': movie.get('title'),
            'poster': poster,
            'genres': genres,
            'predicted_revenue': movie.get('predicted_revenue'),
            'actual_revenue': actual_total,
        })

    # Compute error and sort by absolute error (largest misses first)
    def abs_error(item):
        if item['actual_revenue'] is None:
            return -1
        return abs(item['predicted_revenue'] - item['actual_revenue'])

    results = [r for r in results if r['actual_revenue'] is not None]
    results.sort(key=abs_error, reverse=True)
    return jsonify(results)


if __name__ == '__main__':
    app.run(debug=True, port=5000)