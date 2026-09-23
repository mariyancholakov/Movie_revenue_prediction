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
}
