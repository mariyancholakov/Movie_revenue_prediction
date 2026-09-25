"""Scheduled pipeline job (run weekly by .github/workflows/pipeline.yml):
settle finished theatrical runs onto the Ledger. Retraining is separate and
deliberate (retrain.py, or the workflow's manual retrain job).

Standalone — does NOT need the Flask server running; it talks to Supabase/TMDB
directly. Safe to run by hand any time:  ./venv/bin/python capture_finished.py

Every run appends to logs/pipeline.log.
"""
import os
import sys
from datetime import datetime, timezone

# Relative paths in app.py assume the flask-api dir is the cwd.
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from app import capture_finished_runs  # noqa: E402  (after chdir)

LOG_FILE = 'logs/pipeline.log'


def log(msg):
    os.makedirs('logs', exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%SZ')
    line = f"[{stamp}] {msg}"
    print(line)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')


def main():
    log("=== pipeline run start ===")

    result = capture_finished_runs()
    if 'error' in result:
        log(f"capture FAILED: {result['error']}")
        sys.exit(1)  # so the scheduled run shows as failed, not green
    titles = ", ".join(m['title'] for m in result['finished']) or "none"
    log(f"capture: checked {result['checked']} tracked | newly finished "
        f"{result['newly_finished']} ({titles}) | awaiting revenue {result['pending_revenue']}")
    if result.get('revenue_updated'):
        log(f"revenue revised upward for: {', '.join(result['revenue_updated'])}")

    log("=== pipeline run end ===")


if __name__ == '__main__':
    main()
