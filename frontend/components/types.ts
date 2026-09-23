export interface Movie {
  tmdb_id: number;
  title: string;
  poster: string;
  release_date: string;
  overview: string;
  genres?: string[];
  cast?: string[];
  director?: string;
  budget?: number;
  runtime?: number;
  vote_average?: number | null;
}

export interface DecayCurveData {
  weeks: number[];
  actual_gross: number[];
  fitted_weeks?: number[];
  fitted_gross?: number[];
  decay_rate: number;
}

export interface Prediction {
  opening_weekend: number;
  predicted_revenue: number;
  // Set only once the run has finished: the real total it's settled against.
  actual_revenue?: number | null;
  decay_curve?: DecayCurveData;
  error?: string;
  // Why the prediction failed, set alongside `error` by the API
  // ('network' is set client-side when the request never got an answer).
  code?: 'no_box_office' | 'upstream' | 'not_found' | 'insufficient_data' | 'internal' | 'network';
}
