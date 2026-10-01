"""Tell visitors about the films they saved, only when something meaningful
has changed since they last heard (or since they saved it):

  - the film has opened in US theaters,
  - its forecast has been filed (after the opening weekend),
  - that forecast has moved by PUSH_MOVE_PCT percent or more since the last
    message about it,
  - its run has settled, with the final total beside the forecast.

Run on a schedule (see .github/workflows/pipeline.yml); safe by hand:

    ./venv/bin/python push_alerts.py            # send
    ./venv/bin/python push_alerts.py --dry-run  # print what would be sent

Env: SUPABASE_URL / SUPABASE_KEY / TMDB_API_KEY as for the other jobs, plus
VAPID_PRIVATE_KEY and VAPID_SUBJECT (VAPID_PUBLIC_KEY is served to browsers by
the API). Make a key pair once with:

    from py_vapid import Vapid; import base64
    from cryptography.hazmat.primitives import serialization as s
    v = Vapid(); v.generate_keys()
    b = lambda x: base64.urlsafe_b64encode(x).rstrip(b'=').decode()
    print(b(v.public_key.public_bytes(s.Encoding.X962, s.PublicFormat.UncompressedPoint)))
    print(b(v.private_key.private_numbers().private_value.to_bytes(32, 'big')))
"""
import json
import os
import sys
from collections import defaultdict

# Relative paths in app.py (model + data) assume flask-api is the cwd.
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from pywebpush import WebPushException, webpush  # noqa: E402
from app import film_state, supabase  # noqa: E402  (after chdir)

ORDER = {'upcoming': 0, 'opened': 1, 'forecast': 2, 'settled': 3}
MOVE_PCT = float(os.getenv('PUSH_MOVE_PCT', '10'))
PRIVATE_KEY = os.getenv('VAPID_PRIVATE_KEY', '').strip()
SUBJECT = os.getenv('VAPID_SUBJECT', '').strip()


def money(n):
    """$X.XM / $X.XXB, as the site prints it."""
    return f"${n / 1e9:.2f}B" if n >= 1e9 else f"${n / 1e6:.1f}M"


def message(title, last, now):
    """(headline, body) for what changed between two states, or None."""
    if ORDER[now['stage']] > ORDER.get(last.get('stage'), 0):
        if now['stage'] == 'opened':
            return f"{title} is in theaters", "Its forecast is filed after the opening weekend."
        if now['stage'] == 'forecast':
            return f"{title}: the forecast is in", f"Predicted worldwide total {money(now['forecast'])}."
        return (f"{title} has settled",
                f"Final worldwide total {money(now['actual'])}; the forecast was {money(now['forecast'])}.")
    before = last.get('forecast')
    if now['stage'] == 'forecast' and before and now['forecast']:
        change = (now['forecast'] - before) / before * 100
        if abs(change) >= MOVE_PCT:
            return (f"{title}'s forecast moved {'up' if change > 0 else 'down'}",
                    f"Now {money(now['forecast'])}, was {money(before)} ({change:+.0f}%).")
    return None


def main(dry_run):
    if not dry_run and not (PRIVATE_KEY and SUBJECT):
        sys.exit('VAPID_PRIVATE_KEY and VAPID_SUBJECT must be set.')
    rows = supabase.table('push_subscriptions').select('*').execute().data or []
    by_film = defaultdict(list)
    for r in rows:
        by_film[r['tmdb_id']].append(r)
    sent = dropped = 0
    for tmdb_id, subs in by_film.items():
        now = film_state(tmdb_id)
        if now is None:
            continue  # TMDB or the database didn't answer; try again next run
        for r in subs:
            msg = message(r['title'], r.get('last_state') or {}, now)
            if not msg:
                continue
            print(f"[push] {tmdb_id} {r['title']!r}: {msg[0]} - {msg[1]}")
            if dry_run:
                continue
            try:
                webpush(
                    subscription_info={'endpoint': r['endpoint'], 'keys': {'p256dh': r['p256dh'], 'auth': r['auth']}},
                    data=json.dumps({'title': msg[0], 'body': msg[1], 'url': f'/movie/{tmdb_id}', 'tag': f'film-{tmdb_id}'}),
                    vapid_private_key=PRIVATE_KEY,
                    vapid_claims={'sub': SUBJECT},
                    ttl=86400,
                )
                supabase.table('push_subscriptions').update({'last_state': now}) \
                    .eq('endpoint', r['endpoint']).eq('tmdb_id', tmdb_id).execute()
                sent += 1
            except WebPushException as e:
                status = getattr(e.response, 'status_code', None)
                if status in (404, 410):  # the browser has unsubscribed
                    supabase.table('push_subscriptions').delete() \
                        .eq('endpoint', r['endpoint']).execute()
                    dropped += 1
                else:
                    print(f"[push] send failed for {tmdb_id}: {e}")
    print(f"[push] {len(rows)} subscriptions, {sent} sent, {dropped} dropped")


if __name__ == '__main__':
    main('--dry-run' in sys.argv)
