"""LeapBuilder M9.3 — per-user identity from oauth2-proxy headers.

When OpenHands runs behind an oauth2-proxy front door (as LeapBuilder does),
oauth2-proxy forwards the authenticated user's identity + access token via
request headers:

    X-Forwarded-Email           -> user email
    X-Forwarded-User            -> github login
    X-Forwarded-Access-Token    -> github oauth access token
    X-Auth-Request-Email        -> (alternate spelling some proxies emit)
    X-Auth-Request-Access-Token -> (alternate spelling)

This UserAuth implementation reads those headers and threads the user_id
into the rest of OpenHands' per-user plumbing (SettingsStore, SecretsStore,
etc.) — so each user gets their own settings/secrets file, and their own
GitHub token is available to the integrations layer.

Selection: set ``OPENHANDS_CONFIG_CLS`` to a server config subclass that
sets ``user_auth_class`` to this class's import path. See
``leapbuilder_config.py`` in this directory for the reference subclass.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request
from pydantic import SecretStr

from openhands.app_server.user_auth.default_user_auth import DefaultUserAuth
from openhands.app_server.user_auth.user_auth import UserAuth


def _first_header(request: Request, *names: str) -> str | None:
    """Return the first non-empty header value from ``names``, or None."""
    for name in names:
        value = request.headers.get(name)
        if value:
            value = value.strip()
            if value:
                return value
    return None


@dataclass
class OAuth2ProxyUserAuth(DefaultUserAuth):
    """User auth backed by oauth2-proxy forwarded headers.

    Subclasses :class:`DefaultUserAuth` so the SettingsStore / SecretsStore
    plumbing (which scopes by ``user_id``) just works — the only thing we
    override is the identity extraction.
    """

    _user_id: str | None = None
    _user_email: str | None = None
    _access_token: SecretStr | None = None

    async def get_user_id(self) -> str | None:
        return self._user_id

    async def get_user_email(self) -> str | None:
        return self._user_email

    async def get_access_token(self) -> SecretStr | None:
        return self._access_token

    @classmethod
    async def get_instance(cls, request: Request) -> UserAuth:
        email = _first_header(
            request,
            'X-Forwarded-Email',
            'X-Auth-Request-Email',
        )
        github_login = _first_header(
            request,
            'X-Forwarded-User',
            'X-Auth-Request-User',
            'X-Auth-Request-Preferred-Username',
        )
        access_token = _first_header(
            request,
            'X-Forwarded-Access-Token',
            'X-Auth-Request-Access-Token',
        )

        # Prefer email as the stable user_id (won't change when a user
        # renames on GitHub). Fall back to login, then to None (which
        # degrades cleanly to the DefaultUserAuth single-tenant behavior).
        user_id = email or github_login

        # M9 — record presence for the admin users list. Cheap, best-effort.
        # M11 v1 — also upsert into the DB-backed lb_users table; the first
        # ever upsert auto-assigns the super_admin sys role (bootstrap).
        if email:
            try:
                from openhands.app_server.leapbuilder import users_store
                users_store.record(email, github_login)
            except Exception:  # pragma: no cover
                pass
            try:
                from openhands.app_server.config import get_db_session
                from openhands.app_server.leapbuilder import rbac_store

                async with get_db_session(request.state, request) as session:
                    await rbac_store.upsert_user(session, email, github_login)
                    await session.commit()
            except Exception:  # pragma: no cover
                # DB not yet migrated, or session unavailable — leave the
                # JSON tracker as the fallback record.
                pass

        return cls(
            _user_id=user_id,
            _user_email=email,
            _access_token=SecretStr(access_token) if access_token else None,
        )
