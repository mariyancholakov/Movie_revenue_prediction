from flask import Flask, jsonify, request
from flask_cors import CORS
import joblib
import pandas as pd
import numpy as np
from scraper import get_now_playing, get_movie_details, get_opening_weekend, get_weekly_grossing, parse_and_fit_decay
from datetime import datetime

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000"])

model = joblib.load('models/box_office_model_final.pkl')
feature_columns = joblib.load('models/feature_columns_final.pkl')

MAJOR_STUDIOS = ['Warner Bros', 'Disney', 'Marvel', 'Universal', 'Paramount', 'Sony', 'Legendary', 'Columbia']
GENRES = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
          'Drama', 'Family', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Science Fiction', 'Thriller']

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

@app.route('/api/predict', methods=['POST'])
def predict():
    data = request.json
    tmdb_id = data['tmdb_id']
    
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
    
    return jsonify({
        'title': details['title'],
        'predicted_revenue': round(predicted_revenue),
        'opening_weekend': opening_weekend,
        'decay_curve': decay_data,
        'details': {
            'budget': details.get('budget'),
            'runtime': details.get('runtime'),
            'genres': [g['name'] for g in details.get('genres', [])],
            'poster': f"https://image.tmdb.org/t/p/w500{details.get('poster_path')}",
        }
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)