"""Scheduled pipeline job (run weekly): capture finished theatrical runs, and
retrain the model once enough new labelled examples have accumulated.

Standalone — does NOT need the Flask server running; it talks to Supabase/TMDB
directly. Intended to be driven by a launchd/cron schedule, but safe to run by
hand any time:  ./venv/bin/python capture_finished.py

Behaviour is tunable with env vars:
  CAPTURE_RETRAIN_THRESHOLD  new trainable rows since last retrain that trigger
                             a retrain (default 10)
  CAPTURE_SKIP_RETRAIN       "1" to only capture, never retrain (used in CI,
                             where retraining is a separate manual workflow)
  CAPTURE_AUTO_PROMOTE       "1" to let an auto-retrain swap production if it
                             wins the holdout (default off — build a candidate
                             and report only; you promote deliberately)

Every run appends to logs/pipeline.log.
"""
import json
import os
import sys
from datetime import datetime, timezone

# Relative paths in app.py / retrain.py assume the flask-api dir is the cwd.
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from app import capture_finished_runs          # noqa: E402  (after chdir)
from retrain import load_captured, run_retrain  # noqa: E402

STATE_FILE = 'models/pipeline_state.json'
LOG_FILE = 'logs/pipeline.log'
THRESHOLD = int(os.getenv('CAPTURE_RETRAIN_THRESHOLD', '10'))
AUTO_PROMOTE = os.getenv('CAPTURE_AUTO_PROMOTE', '') == '1'
SKIP_RETRAIN = os.getenv('CAPTURE_SKIP_RETRAIN', '') == '1'


def log(msg):
    os.makedirs('logs', exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%SZ')
    line = f"[{stamp}] {msg}"
    print(line)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')


def read_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {'trainable_at_last_retrain': 0}


def write_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)


def main():
    log("=== pipeline run start ===")

    # 1. Capture any newly-finished runs.
    result = capture_finished_runs()
    if 'error' in result:
        log(f"capture FAILED: {result['error']}")
        sys.exit(1)  # so the scheduled run shows as failed, not green
    titles = ", ".join(m['title'] for m in result['finished']) or "none"
    log(f"capture: checked {result['checked']} tracked | newly finished "
        f"{result['newly_finished']} ({titles}) | awaiting revenue {result['pending_revenue']}")
    if result.get('revenue_updated'):
        log(f"revenue revised upward for: {', '.join(result['revenue_updated'])}")

    # 2. Decide whether enough new labelled data has accumulated to retrain.
    trainable = len(load_captured())
    if SKIP_RETRAIN:
        log(f"trainable rows: {trainable} | retrain skipped (CAPTURE_SKIP_RETRAIN=1)")
        log("=== pipeline run end ===")
        return
    state = read_state()
    since = trainable - state.get('trainable_at_last_retrain', 0)
    log(f"trainable rows: {trainable} | new since last retrain: {since} | threshold: {THRESHOLD}")

    if since < THRESHOLD:
        log(f"below threshold — skipping retrain ({since}/{THRESHOLD})")
        log("=== pipeline run end ===")
        return

    # 3. Retrain. Auto-promotion is opt-in; otherwise we only build+report a candidate.
    log(f"threshold reached — retraining (auto_promote={AUTO_PROMOTE})")
    r = run_retrain(promote=AUTO_PROMOTE)
    log(f"retrain: reference MAE ${r['reference']['mae']/1e6:.2f}M / median APE {r['reference']['median_ape']:.1f}% -> "
        f"candidate MAE ${r['candidate']['mae']/1e6:.2f}M / median APE {r['candidate']['median_ape']:.1f}% "
        f"| wins={r['wins']} | promoted={r['promoted']}")
    if r['candidate_path']:
        log(f"candidate saved: {r['candidate_path']}")
    if r['promoted']:
        log(f"PROMOTED to production (backup: {r['backup_path']}). Restart Flask to load it.")
    elif r['wins']:
        log("a better model is ready — run `./venv/bin/python retrain.py --promote` to deploy it")

    state['trainable_at_last_retrain'] = trainable
    write_state(state)
    log("=== pipeline run end ===")


if __name__ == '__main__':
    main()
