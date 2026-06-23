"""LeapBuilder admin/diagnostics endpoints.

Exposed under ``/api/v1/lb/`` once mounted from ``v1_router``. Endpoints:

* ``GET /api/v1/lb/users``   — list of authenticated identities + roles
* ``GET /api/v1/lb/roles``   — list of roles + permissions
* ``POST /api/v1/lb/roles``  — create role (super_admin only)
* ``PATCH /api/v1/lb/roles/{id}`` — edit role meta (super_admin only)
* ``DELETE /api/v1/lb/roles/{id}`` — delete role (super_admin only)
* ``PUT /api/v1/lb/roles/{id}/permissions`` — replace permission set
* ``PATCH /api/v1/lb/users/{email}`` — enable/disable user
* ``POST /api/v1/lb/users/{email}/roles/{role_id}`` — assign role
* ``DELETE /api/v1/lb/users/{email}/roles/{role_id}`` — remove role

Auth model (M11 v1):
  - Admin-only endpoints are gated by `is_super_admin()` (DB-backed).
  - Bootstrap policy: first signed-in user is auto-assigned super_admin.
  - Legacy env-driven `LB_ADMIN_EMAILS` is honored as a FALLBACK only
    when the DB has no super_admin (covers existing deployments not yet
    migrated). Once a super_admin exists in the DB, env is ignored.
  - Self-edit guard: API rejects role / enabled changes where
    target == requester.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from openhands.app_server.leapbuilder import rbac_store, users_store

router = APIRouter(prefix='/lb', tags=['LeapBuilder'])


# ---------- Schemas --------------------------------------------------------


class CreateRoleIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str
    description: str | None = None
    permissions: list[str] = []


class UpdateRoleIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str | None = None
    description: str | None = None
    is_enabled: bool | None = None


class SetPermissionsIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    permissions: list[str]


class UpdateUserIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    is_enabled: bool


# ---------- Auth helpers ---------------------------------------------------


def _env_admin_emails() -> set[str]:
    raw = os.environ.get('LB_ADMIN_EMAILS', '')
    return {e.strip() for e in raw.split(',') if e.strip()}


def _current_email(request: Request) -> str | None:
    for header in ('X-Forwarded-Email', 'X-Auth-Request-Email'):
        v = request.headers.get(header)
        if v and v.strip():
            return v.strip()
    return None


async def _get_session(request: Request) -> AsyncSession:
    """Resolve an AsyncSession via the OpenHands global config injector.

    Imported lazily — pure-function tests don't have a global config and
    drive the store directly. Real requests always have one.

    NB: pass ``request.state`` (per-request) NOT ``request.app.state``
    (app-wide) — the db_session_injector caches the session on the
    state object, so app.state would cause all concurrent requests to
    share one session and trip SQLAlchemy's "concurrent operations not
    permitted" guard.
    """
    from openhands.app_server.config import get_db_session

    async with get_db_session(request.state, request) as session:
        yield session


def _current_github_login(request: Request) -> str | None:
    for h in (
        'X-Forwarded-User',
        'X-Auth-Request-User',
        'X-Auth-Request-Preferred-Username',
    ):
        v = request.headers.get(h)
        if v and v.strip():
            return v.strip()
    return None


async def _track_user(request: Request, session: AsyncSession) -> str | None:
    """Upsert the authed identity into lb_users (the bootstrap path —
    very first upsert auto-assigns the super_admin sys role)."""
    email = _current_email(request)
    if not email:
        return None
    try:
        await rbac_store.upsert_user(
            session, email, _current_github_login(request)
        )
        await session.commit()
    except Exception:
        # Best-effort. The endpoint will still run; admin gating will
        # just fall back to env fallback if the DB is unreachable.
        pass
    return email


async def _is_env_fallback_admit(
    session: AsyncSession, email: str
) -> bool:
    """True if env LB_ADMIN_EMAILS admits this user AND the DB has zero
    super_admins (unbootstrapped deployment escape hatch)."""
    if email not in _env_admin_emails():
        return False
    from sqlalchemy import func, select
    from openhands.app_server.leapbuilder.models import (
        SUPER_ADMIN_ROLE_ID,
        LbUserRole,
    )

    has_any = (
        await session.execute(
            select(func.count()).select_from(LbUserRole).where(
                LbUserRole.role_id == SUPER_ADMIN_ROLE_ID
            )
        )
    ).scalar_one()
    return has_any == 0


async def _resolve_admin(request: Request, session: AsyncSession) -> str:
    """Legacy "any admin" gate. Returns the email if the requester is
    super_admin OR env-fallback-admitted. 404 otherwise.

    New endpoints should use _require_perm(perm) with a catalog string."""
    email = await _track_user(request, session)
    if not email:
        raise HTTPException(status_code=404)
    if await rbac_store.is_super_admin(session, email):
        return email
    if await _is_env_fallback_admit(session, email):
        return email
    raise HTTPException(status_code=404)


async def _require_perm(
    request: Request, session: AsyncSession, perm: str
) -> str:
    """Catalog-permission gate. Returns the email if the requester:
      - is super_admin (bypass), OR
      - is env-fallback-admitted (unbootstrapped deployments), OR
      - holds a role granting `perm`.

    Raises 404 otherwise — same response as anonymous + non-admin so
    routes can't be enumerated.
    """
    email = await _track_user(request, session)
    if not email:
        raise HTTPException(status_code=404)
    if await rbac_store.is_super_admin(session, email):
        return email
    if await _is_env_fallback_admit(session, email):
        return email
    if await rbac_store.has_permission(
        session, email=email, permission=perm
    ):
        return email
    raise HTTPException(status_code=404)


# ---------- Endpoints ------------------------------------------------------


@router.get('/me')
async def get_me(
    request: Request,
    session: AsyncSession = Depends(_get_session),
) -> dict:
    """Lightweight identity probe used by the frontend to decide whether
    to show admin UI affordances (sidebar entries, action buttons).

    Returns:
      email: the resolved identity, or null for anonymous.
      is_super_admin: holds the super_admin sys role.
      is_admin: any of: super_admin, env-fallback-admitted, or holds at
        least one catalog permission. Use this as a coarse 'show admin
        UI at all' check.
      permissions: effective union of permission strings from enabled
        roles. Empty list for super_admin (they bypass and the empty
        list is more honest than enumerating everything).

    Also runs the bootstrap upsert so visiting any UI page triggers
    first-user registration.
    """
    email = await _track_user(request, session)
    if not email:
        return {
            'email': None,
            'is_admin': False,
            'is_super_admin': False,
            'permissions': [],
        }
    is_super = await rbac_store.is_super_admin(session, email)
    env_fallback = await _is_env_fallback_admit(session, email)
    perms = (
        [] if is_super else await rbac_store.get_user_permissions(session, email)
    )
    is_admin = is_super or env_fallback or bool(perms)
    return {
        'email': email,
        'is_admin': is_admin,
        'is_super_admin': is_super or env_fallback,
        'permissions': perms,
    }


@router.get('/roles')
async def get_roles(
    request: Request,
    session: AsyncSession = Depends(_get_session),
) -> dict:
    # Public-ish: any authenticated identity can read the role list.
    # The Users page needs role names + ids to render the assign-role
    # dropdown and the role chips next to each user, so the read side
    # has to be available to anyone who can read /users. Anonymous
    # requests still get the list (it carries no PII).
    await _track_user(request, session)
    roles = await rbac_store.list_roles(session)
    return {
        'roles': [
            {
                'id': r.id,
                'name': r.name,
                'description': r.description,
                'is_system': r.is_system,
                'is_enabled': r.is_enabled,
                'created_at': r.created_at.isoformat(),
                'permissions': r.permissions,
            }
            for r in roles
        ]
    }


@router.post('/roles', status_code=201)
async def create_role(
    body: CreateRoleIn,
    request: Request,
    session: AsyncSession = Depends(_get_session),
) -> dict:
    await _require_perm(request, session, 'roles:add')
    try:
        role = await rbac_store.create_role(
            session,
            name=body.name,
            description=body.description,
            permissions=body.permissions,
        )
    except rbac_store.SystemRoleImmutable as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await session.commit()
    return _role_to_dict(role)


@router.patch('/roles/{role_id}')
async def update_role(
    role_id: str,
    body: UpdateRoleIn,
    request: Request,
    session: AsyncSession = Depends(_get_session),
) -> dict:
    # Pick the right permission based on what the body actually changes:
    #   - only is_enabled → roles:toggle_status
    #   - anything else  → roles:update
    only_toggles = (
        body.is_enabled is not None
        and body.name is None
        and body.description is None
    )
    perm = 'roles:toggle_status' if only_toggles else 'roles:update'
    await _require_perm(request, session, perm)
    try:
        role = await rbac_store.update_role(
            session,
            role_id=role_id,
            name=body.name,
            description=body.description,
            is_enabled=body.is_enabled,
        )
    except rbac_store.NotFound:
        raise HTTPException(status_code=404, detail='role not found')
    except rbac_store.SystemRoleImmutable as e:
        raise HTTPException(status_code=400, detail=str(e))
    await session.commit()
    return _role_to_dict(role)


@router.delete('/roles/{role_id}', status_code=204)
async def delete_role(
    role_id: str,
    request: Request,
    session: AsyncSession = Depends(_get_session),
):
    # No separate 'roles:delete' in the catalog; delete is treated as a
    # superset of update for now. Add a delete-specific perm later if
    # we ever want to split "can edit" from "can remove".
    await _require_perm(request, session, 'roles:update')
    try:
        await rbac_store.delete_role(session, role_id=role_id)
    except rbac_store.NotFound:
        raise HTTPException(status_code=404, detail='role not found')
    except rbac_store.SystemRoleImmutable as e:
        raise HTTPException(status_code=400, detail=str(e))
    await session.commit()


@router.put('/roles/{role_id}/permissions')
async def set_role_permissions(
    role_id: str,
    body: SetPermissionsIn,
    request: Request,
    session: AsyncSession = Depends(_get_session),
) -> dict:
    await _require_perm(request, session, 'roles:update')
    try:
        role = await rbac_store.set_role_permissions(
            session, role_id=role_id, permissions=body.permissions
        )
    except rbac_store.NotFound:
        raise HTTPException(status_code=404, detail='role not found')
    except rbac_store.SystemRoleImmutable as e:
        raise HTTPException(status_code=400, detail=str(e))
    await session.commit()
    return _role_to_dict(role)


@router.get('/users')
async def get_users(
    request: Request,
    session: AsyncSession = Depends(_get_session),
) -> dict:
    await _require_perm(request, session, 'users:view')
    users = await rbac_store.list_users(session)
    return {
        'users': [_user_to_dict(u) for u in users],
        'total': len(users),
    }


@router.patch('/users/{email}')
async def update_user(
    email: str,
    body: UpdateUserIn,
    request: Request,
    session: AsyncSession = Depends(_get_session),
) -> dict:
    # PATCH /users/{email} only flips is_enabled today → toggle_status.
    requester = await _require_perm(request, session, 'users:toggle_status')
    try:
        view = await rbac_store.set_user_enabled(
            session,
            target_email=email,
            requester_email=requester,
            enabled=body.is_enabled,
        )
    except rbac_store.NotFound:
        raise HTTPException(status_code=404, detail='user not found')
    except rbac_store.SelfEditNotAllowed as e:
        raise HTTPException(status_code=400, detail=str(e))
    except rbac_store.MinSuperAdminViolation as e:
        raise HTTPException(status_code=400, detail=str(e))
    await session.commit()
    return _user_to_dict(view)


@router.post('/users/{email}/roles/{role_id}', status_code=201)
async def assign_user_role(
    email: str,
    role_id: str,
    request: Request,
    session: AsyncSession = Depends(_get_session),
) -> dict:
    requester = await _require_perm(request, session, 'users:update')
    try:
        view = await rbac_store.assign_role(
            session,
            target_email=email,
            requester_email=requester,
            role_id=role_id,
        )
    except rbac_store.NotFound as e:
        raise HTTPException(status_code=404, detail=str(e))
    except rbac_store.SelfEditNotAllowed as e:
        raise HTTPException(status_code=400, detail=str(e))
    await session.commit()
    return _user_to_dict(view)


@router.delete('/users/{email}/roles/{role_id}')
async def remove_user_role(
    email: str,
    role_id: str,
    request: Request,
    session: AsyncSession = Depends(_get_session),
) -> dict:
    requester = await _require_perm(request, session, 'users:update')
    try:
        view = await rbac_store.remove_role(
            session,
            target_email=email,
            requester_email=requester,
            role_id=role_id,
        )
    except rbac_store.NotFound as e:
        raise HTTPException(status_code=404, detail=str(e))
    except rbac_store.SelfEditNotAllowed as e:
        raise HTTPException(status_code=400, detail=str(e))
    except rbac_store.MinSuperAdminViolation as e:
        raise HTTPException(status_code=400, detail=str(e))
    await session.commit()
    return _user_to_dict(view)


# ---------- Helpers --------------------------------------------------------


def _role_to_dict(r) -> dict:
    return {
        'id': r.id,
        'name': r.name,
        'description': r.description,
        'is_system': r.is_system,
        'is_enabled': r.is_enabled,
        'created_at': r.created_at.isoformat(),
        'permissions': r.permissions,
    }


def _user_to_dict(u) -> dict:
    return {
        'id': u.id,
        'email': u.email,
        'github_login': u.github_login,
        'first_seen_at': u.first_seen_at.isoformat(),
        'last_seen_at': u.last_seen_at.isoformat(),
        'is_enabled': u.is_enabled,
        'role_ids': u.role_ids,
        'role_names': u.role_names,
    }


# ---------- Legacy active-users tracker ------------------------------------
# Kept for backward compat with deployments that haven't migrated to the
# DB-backed users_store yet. The file-based tracker stays alongside the
# DB rows during the transition; both are written on every authed request
# from oauth2proxy_user_auth.
def legacy_active_users() -> list[dict]:
    return users_store.all_users()
