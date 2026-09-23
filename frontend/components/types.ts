export interface Movie {
  tmdb_id: number;
  title: string;
  poster: string;
  release_date: string;
  // First US theatrical date ('' if unknown); predictions start from the US opening.
  us_release_date?: string;
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
  code?: ErrorCode;
}

export type ErrorCode =
  | 'not_released'           // release date is still ahead
  | 'no_opening_weekend'     // on Box Office Mojo, but no US opening weekend yet
  | 'no_us_release'          // Box Office Mojo has no page for the film
  | 'no_listing'             // no IMDb id, so nothing to look up
  | 'insufficient_data'      // TMDB lacks a detail the model needs
  | 'not_found'              // TMDB has no film with this id
  | 'tmdb_unavailable'       // TMDB didn't answer
  | 'box_office_unavailable' // Box Office Mojo didn't answer
  | 'bad_request'
  | 'internal'
  | 'network';
