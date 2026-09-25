"""Pre-warm the prediction cache for every film now playing: TMDB's list plus
priced films TMDB dropped mid-run (showing_now), so their weekly grosses keep
updating until the run settles.

Why: a cold /api/predict scrapes Box Office Mojo live, which is slow and prone to
IP-blocks from a server. Running this on a schedule (or once after deploy) means
the now-playing set is already in Supabase, so a visitor almost always hits warm
cache and predictions feel instant — live scraping becomes the rare fallback,
not the norm.

Standalone — does NOT need the Flask server running; it reuses the same
predict_for() core the API uses, so a warmed film and a live request go through
exactly the same path. Safe to run by hand any time:

    ./venv/bin/python warm_cache.py

Env vars:
  WARM_DELAY_SECONDS   pause between films to be polite to Box Office Mojo
                       (default 2.0). Cached-fresh films skip the scrape and
                       return fast regardless.
"""
import os
import sys
import time
from datetime import datetime, timezone

# Relative paths in app.py (model + data) assume flask-api is the cwd.
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from app import predict_for, showing_now  # noqa: E402  (after chdir)

LOG_FILE = 'logs/pipeline.log'
DELAY = float(os.getenv('WARM_DELAY_SECONDS', '2.0'))


def log(msg):
    os.makedirs('logs', exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%SZ')
    line = f"[{stamp}] {msg}"
    print(line)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')


def main():
    log("=== warm_cache run start ===")
    movies = showing_now()
    if not movies:
        log("warm_cache: TMDB returned no now-playing films (upstream down?) — nothing to do")
        log("=== warm_cache run end ===")
        sys.exit(1)  # so the scheduled run shows as failed, not green

    warmed = fresh = failed = 0
    for m in movies:
        tid, title = m['tmdb_id'], m['title']
        try:
            payload, status = predict_for(tid)
        except Exception as e:  # never let one film abort the whole warm pass
            failed += 1
            log(f"  ✗ {title} ({tid}): unexpected error: {e}")
            continue

        if status != 200:
            failed += 1
            log(f"  ✗ {title} ({tid}): {status} {payload.get('error', '')}")
            continue

        if payload.get('cached'):
            fresh += 1  # already warm, no scrape performed
            continue

        warmed += 1
        rev = payload.get('predicted_revenue')
        log(f"  ✓ {title} ({tid}): warmed — predicted ${rev/1e6:.1f}M"
            if rev else f"  ✓ {title} ({tid}): warmed")
        time.sleep(DELAY)  # only pace after an actual scrape

    log(f"warm_cache: {len(movies)} now-playing | newly warmed {warmed} | "
        f"already fresh {fresh} | failed {failed}")
    log("=== warm_cache run end ===")


if __name__ == '__main__':
    main()
