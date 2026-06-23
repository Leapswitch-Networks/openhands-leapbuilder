"""LeapBuilder — minimal "active users" tracker.

OAuth2ProxyUserAuth records each authenticated identity here on every
request that has a user_id. The router exposes the list under
/api/v1/lb/users for the admin status page.

Storage: a single JSON file at ``/.openhands/lb_users.json`` (or whatever
``LB_USERS_FILE`` is set to). One entry per email, updated with
``last_seen_at`` + ``github_login`` on every authed request. No DB.

Persistence is fail-safe: if disk write errors, we keep the in-memory
copy and log a warning. Read-back on startup repopulates the in-memory
copy.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_LOCK = threading.Lock()
_DEFAULT_PATH = '/.openhands/lb_users.json'


def _path() -> str:
    return os.environ.get('LB_USERS_FILE', _DEFAULT_PATH)


def _load() -> dict[str, dict]:
    p = _path()
    if not os.path.exists(p):
        return {}
    try:
        with open(p, 'r') as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
        return {}
    except Exception:
        logger.warning('lb_users.json unreadable; starting empty')
        return {}


# Loaded lazily on first call. Module import time is too early — the
# /.openhands path may not exist yet.
_USERS: dict[str, dict] | None = None


def _ensure() -> dict[str, dict]:
    global _USERS
    if _USERS is None:
        with _LOCK:
            if _USERS is None:
                _USERS = _load()
    return _USERS


def record(email: str, github_login: str | None = None) -> None:
    """Record/refresh a user's presence. Cheap; called on every authed request."""
    if not email:
        return
    users = _ensure()
    now = datetime.now(timezone.utc).isoformat()
    with _LOCK:
        entry = users.get(email, {})
        if 'first_seen_at' not in entry:
            entry['first_seen_at'] = now
        entry['last_seen_at'] = now
        if github_login:
            entry['github_login'] = github_login
        users[email] = entry
        try:
            tmp = _path() + '.tmp'
            with open(tmp, 'w') as f:
                json.dump(users, f, indent=2, sort_keys=True)
            os.replace(tmp, _path())
        except Exception:
            logger.warning(
                'lb_users.json write failed; in-memory copy still current',
                exc_info=True,
            )


def all_users() -> list[dict]:
    """Return the snapshot list, newest-active first."""
    users = _ensure()
    out = []
    for email, entry in users.items():
        out.append({'email': email, **entry})
    out.sort(key=lambda e: e.get('last_seen_at', ''), reverse=True)
    return out
