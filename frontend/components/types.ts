export interface Movie {
  tmdb_id: number;
  title: string;
  poster: string;
  release_date: string;
  overview: string;
  genres?: string[];
}

export interface DecayCurveData {
  weeks: number[];
  actual_gross: number[];
  fitted_weeks: number[];
  fitted_gross: number[];
  decay_rate: number;
}

export interface Prediction {
  opening_weekend: number;
  predicted_revenue: number;
  decay_curve?: DecayCurveData;
  error?: string;
}
