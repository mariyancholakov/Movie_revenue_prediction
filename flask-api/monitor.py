"""The operator's health report: is the live model still as good as the exam
said, and are the jobs that feed it still running? Read-only; behind
/api/admin/monitor (ADMIN_API_KEY), never public.

Everything here is derived from what is already stored: the movies table
(tracked films, settled runs with their opening and later calls) and the
promoted model's own files (models/production_metrics.json)."""
import json
import os
import statistics
from datetime import datetime, timezone

# A live median miss this many times the exam's median miss is a watch / an alert.
WATCH_RATIO = 1.25
ALERT_RATIO = 1.5
# Settled runs needed before a live median says anything.
MIN_SETTLED = 8
# The last N settled runs are the "rolling" window.
ROLLING = 10
# A tracked film is re-scraped when a US weekend posts (and at most every 7
# days otherwise); anything older than this was missed.
STALE_DAYS = 8
# The daily warm job should have touched the newest tracked film within this.
WARM_DAYS = 2
# Captures happen Sundays; a film that has left theaters should settle soon.
NO_SETTLE_DAYS = 21
MODEL_OLD_DAYS = 120

LEVELS = {'ok': 0, 'watch': 1, 'alert': 2}


def _parse(ts):
    if not ts:
        return None
    try:
        return datetime.fromisoformat(str(ts).replace('Z', '+00:00'))
    except ValueError:
        return None


def _age_days(ts, now):
    t = _parse(ts)
    return None if t is None else max(0.0, (now - t).total_seconds() / 86400)


def _miss(pred, actual):
    """Unsigned miss as a percent of the actual total, the figure the exam uses."""
    return abs(pred - actual) / actual * 100


def _bias(pred, actual):
    """Signed: positive = the model called it too high."""
    return (pred - actual) / actual * 100


def _scores(films, stage):
    """(miss %, signed %, dollars off) for every settled film with that call."""
    out = []
    for m in films:
        actual = m.get('actual_revenue')
        pred = m.get('predicted_revenue') if stage == 1 else (m.get('later_calls') or {}).get(str(stage))
        if actual and actual > 0 and pred:
            out.append((_miss(pred, actual), _bias(pred, actual), abs(pred - actual)))
    return out


def _summary(scores, expected):
    if not scores:
        return {'n': 0, 'median_miss': None, 'bias': None, 'mae': None, 'expected': expected, 'ratio': None}
    median = statistics.median(s[0] for s in scores)
    return {
        'n': len(scores),
        'median_miss': round(median, 1),
        'bias': round(statistics.median(s[1] for s in scores), 1),
        'mae': round(statistics.fmean(s[2] for s in scores)),
        'expected': round(expected, 1) if expected is not None else None,
        'ratio': round(median / expected, 2) if expected else None,
    }


def load_production_metrics(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def model_report(model_path, metrics, now):
    try:
        trained = datetime.fromtimestamp(os.path.getmtime(model_path), timezone.utc)
    except OSError:
        trained = None
    stages = (metrics or {}).get('stages') or {}
    return {
        'file': os.path.basename(model_path),
        'file_modified': trained.isoformat() if trained else None,
        'age_days': round((now - trained).total_seconds() / 86400) if trained else None,
        'seed_rows': (metrics or {}).get('seed_rows'),
        'captured_rows': (metrics or {}).get('captured_rows'),
        'holdout_n': (metrics or {}).get('holdout_n'),
        'exam': {k: {'median_miss': round(v['median_ape'], 1), 'mae': round(v['mae'])}
                 for k, v in sorted(stages.items(), key=lambda kv: int(kv[0]))},
    }


def build_report(movies, push_count, model_path, metrics, now=None):
    """`movies`: rows of the movies table with tmdb_id, title, is_in_theaters,
    last_scraped, finished_at, predicted_revenue, actual_revenue, later_calls."""
    now = now or datetime.now(timezone.utc)
    exam = {int(k): v['median_ape'] for k, v in ((metrics or {}).get('stages') or {}).items()}
    flags = []

    def flag(level, text):
        flags.append({'level': level, 'text': text})

    settled = [m for m in movies if m.get('is_in_theaters') is False
               and m.get('actual_revenue') and m.get('predicted_revenue')]
    settled.sort(key=lambda m: m.get('finished_at') or '')
    tracked = [m for m in movies if m.get('is_in_theaters') is True]

    # --- live accuracy, against what the exam promised ---
    accuracy = {'opening': _summary(_scores(settled, 1), exam.get(1)),
                'rolling': _summary(_scores(settled[-ROLLING:], 1), exam.get(1)),
                'later': {str(k): _summary(_scores(settled, k), exam.get(k)) for k in (2, 4, 8)}}
    for label, s in (('all settled runs', accuracy['opening']),
                     (f'the last {ROLLING} settled runs', accuracy['rolling'])):
        if s['n'] < MIN_SETTLED:
            flag('ok', f"Only {s['n']} settled runs in {label}: too few to judge the live miss.")
        elif s['ratio'] >= ALERT_RATIO:
            flag('alert', f"Opening-call median miss on {label} is {s['median_miss']}% against "
                          f"{s['expected']}% on the exam.")
        elif s['ratio'] >= WATCH_RATIO:
            flag('watch', f"Opening-call median miss on {label} is {s['median_miss']}% against "
                          f"{s['expected']}% on the exam.")
    # A model that keeps calling high (or low) is drifting even when the median miss is fine.
    r = accuracy['rolling']
    if r['n'] >= MIN_SETTLED and r['bias'] is not None and abs(r['bias']) >= 15:
        flag('watch', f"The last {ROLLING} settled runs were called {abs(r['bias'])}% "
                      f"{'high' if r['bias'] > 0 else 'low'} at the median.")

    # --- whether the data jobs are still running ---
    scraped = [a for a in (_age_days(m.get('last_scraped'), now) for m in tracked) if a is not None]
    settled_ages = [a for a in (_age_days(m.get('finished_at'), now) for m in settled) if a is not None]
    freshness = {
        'tracked': len(tracked),
        'newest_scrape_days': round(min(scraped), 1) if scraped else None,
        'oldest_scrape_days': round(max(scraped), 1) if scraped else None,
        'stale': sum(1 for a in scraped if a > STALE_DAYS),
        'last_settled_days': round(min(settled_ages), 1) if settled_ages else None,
        'settled': len(settled),
        'push_subscriptions': push_count,
    }
    if tracked and freshness['newest_scrape_days'] is None:
        flag('alert', 'No tracked film has a scrape time.')
    elif tracked and freshness['newest_scrape_days'] > WARM_DAYS:
        flag('alert', f"Nothing has been re-scraped for {freshness['newest_scrape_days']} days: "
                      'the daily warm job looks stopped.')
    if freshness['stale']:
        flag('watch', f"{freshness['stale']} tracked film(s) last scraped over {STALE_DAYS} days ago "
                      f"(oldest {freshness['oldest_scrape_days']} days).")
    if freshness['last_settled_days'] is not None and freshness['last_settled_days'] > NO_SETTLE_DAYS:
        flag('watch', f"No run has settled for {freshness['last_settled_days']} days: "
                      'the Sunday capture may be failing.')

    # --- the model itself ---
    model = model_report(model_path, metrics, now)
    if metrics is None:
        flag('watch', 'models/production_metrics.json is missing: no exam figures to compare against.')
    if model['age_days'] is not None and model['age_days'] > MODEL_OLD_DAYS:
        flag('watch', f"The promoted model file is {model['age_days']} days old: runs keep getting "
                      'shorter, so it may be time to retrain.')

    level = max((f['level'] for f in flags), key=LEVELS.get, default='ok')
    if not flags:
        flag('ok', 'Nothing to report.')
    return {
        'generated_at': now.isoformat(),
        'status': level,
        'flags': sorted(flags, key=lambda f: -LEVELS[f['level']]),
        'model': model,
        'accuracy': accuracy,
        'freshness': freshness,
        # the last settled runs, newest first, for the table
        'recent_settled': [{
            'tmdb_id': m.get('tmdb_id'),
            'title': m.get('title'),
            'finished_at': m.get('finished_at'),
            'predicted': m['predicted_revenue'],
            'actual': int(m['actual_revenue']),
            'miss': round(_miss(m['predicted_revenue'], m['actual_revenue']), 1),
            'bias': round(_bias(m['predicted_revenue'], m['actual_revenue']), 1),
        } for m in reversed(settled[-ROLLING:])],
    }
