"""RBAC store — Postgres-backed users + roles + permissions for M11 v1.

All ops are async + use sqlalchemy's AsyncSession. The caller owns the
session lifecycle (matches the existing OpenHands pattern in
sql_app_conversation_info_service).

Invariants enforced here (not just in the API layer):
  - super_admin role (is_system=True) cannot be deleted or have its
    flags edited.
  - At least one enabled super_admin USER must exist. Removing the last
    super_admin role from a user, or disabling the last super_admin
    user, raises MinSuperAdminViolation.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openhands.app_server.leapbuilder.models import (
    SUPER_ADMIN_ROLE_ID,
    SUPER_ADMIN_ROLE_NAME,
    LbRole,
    LbRolePermission,
    LbUser,
    LbUserRole,
)


class RbacError(Exception):
    """Base for RBAC store errors."""


class NotFound(RbacError):
    """The requested user / role / permission doesn't exist."""


class SystemRoleImmutable(RbacError):
    """Tried to edit or delete the super_admin (or any is_system) role."""


class MinSuperAdminViolation(RbacError):
    """Operation would leave the system without an enabled super_admin user."""


class SelfEditNotAllowed(RbacError):
    """A user is trying to change their own role/enabled state."""


@dataclass
class UserView:
    id: str
    email: str
    github_login: str | None
    first_seen_at: datetime
    last_seen_at: datetime
    is_enabled: bool
    role_ids: list[str] = field(default_factory=list)
    role_names: list[str] = field(default_factory=list)


@dataclass
class RoleView:
    id: str
    name: str
    description: str | None
    is_system: bool
    is_enabled: bool
    created_at: datetime
    permissions: list[str] = field(default_factory=list)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return str(uuid.uuid4())


# ---------- Users ----------------------------------------------------------


async def upsert_user(
    session: AsyncSession, email: str, github_login: str | None = None
) -> LbUser:
    """Record/refresh a user identity. Returns the LbUser row.

    Idempotent — used by oauth2proxy_user_auth on every authed request.
    Also drives the bootstrap-first-user-as-super-admin policy: if this
    is the very first user to ever sign in (no rows in lb_users), they
    get the super_admin role assigned in the same transaction.
    """
    if not email:
        raise ValueError('email is required')
    now = _utcnow()
    result = await session.execute(select(LbUser).where(LbUser.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        # First-ever user? — count BEFORE the insert.
        count_result = await session.execute(select(func.count(LbUser.id)))
        is_bootstrap = count_result.scalar_one() == 0

        user = LbUser(
            id=_new_id(),
            email=email,
            github_login=github_login,
            first_seen_at=now,
            last_seen_at=now,
            is_enabled=True,
        )
        session.add(user)
        await session.flush()

        if is_bootstrap:
            session.add(LbUserRole(user_id=user.id, role_id=SUPER_ADMIN_ROLE_ID))
            await session.flush()
    else:
        user.last_seen_at = now
        if github_login and not user.github_login:
            user.github_login = github_login
        await session.flush()
    return user


async def get_user_by_email(session: AsyncSession, email: str) -> UserView | None:
    result = await session.execute(
        select(LbUser, LbRole)
        .join(LbUserRole, LbUserRole.user_id == LbUser.id, isouter=True)
        .join(LbRole, LbRole.id == LbUserRole.role_id, isouter=True)
        .where(LbUser.email == email)
    )
    rows = result.all()
    if not rows or rows[0][0] is None:
        return None
    u: LbUser = rows[0][0]
    role_ids = [r.id for (_, r) in rows if r is not None]
    role_names = [r.name for (_, r) in rows if r is not None]
    return UserView(
        id=u.id,
        email=u.email,
        github_login=u.github_login,
        first_seen_at=u.first_seen_at,
        last_seen_at=u.last_seen_at,
        is_enabled=u.is_enabled,
        role_ids=role_ids,
        role_names=role_names,
    )


async def list_users(session: AsyncSession) -> list[UserView]:
    result = await session.execute(
        select(LbUser, LbRole)
        .join(LbUserRole, LbUserRole.user_id == LbUser.id, isouter=True)
        .join(LbRole, LbRole.id == LbUserRole.role_id, isouter=True)
    )
    by_user: dict[str, UserView] = {}
    for u, r in result.all():
        view = by_user.get(u.id)
        if view is None:
            view = UserView(
                id=u.id,
                email=u.email,
                github_login=u.github_login,
                first_seen_at=u.first_seen_at,
                last_seen_at=u.last_seen_at,
                is_enabled=u.is_enabled,
            )
            by_user[u.id] = view
        if r is not None:
            view.role_ids.append(r.id)
            view.role_names.append(r.name)
    users = list(by_user.values())
    users.sort(key=lambda v: v.last_seen_at, reverse=True)
    return users


async def _count_enabled_super_admins(
    session: AsyncSession, excluding_user_id: str | None = None
) -> int:
    """Count enabled users who currently hold the super_admin role."""
    query = (
        select(func.count(LbUser.id))
        .join(LbUserRole, LbUserRole.user_id == LbUser.id)
        .where(LbUserRole.role_id == SUPER_ADMIN_ROLE_ID)
        .where(LbUser.is_enabled.is_(True))
    )
    if excluding_user_id is not None:
        query = query.where(LbUser.id != excluding_user_id)
    return (await session.execute(query)).scalar_one()


async def set_user_enabled(
    session: AsyncSession,
    *,
    target_email: str,
    requester_email: str,
    enabled: bool,
) -> UserView:
    if target_email == requester_email:
        raise SelfEditNotAllowed('cannot enable/disable your own account')
    user = (
        await session.execute(select(LbUser).where(LbUser.email == target_email))
    ).scalar_one_or_none()
    if user is None:
        raise NotFound(f'user {target_email}')

    # If disabling and target holds super_admin, ensure another enabled
    # super_admin still exists.
    if not enabled:
        is_sa = (
            await session.execute(
                select(func.count())
                .select_from(LbUserRole)
                .where(LbUserRole.user_id == user.id)
                .where(LbUserRole.role_id == SUPER_ADMIN_ROLE_ID)
            )
        ).scalar_one() > 0
        if is_sa:
            remaining = await _count_enabled_super_admins(
                session, excluding_user_id=user.id
            )
            if remaining == 0:
                raise MinSuperAdminViolation(
                    'at least one enabled super_admin must remain'
                )

    user.is_enabled = enabled
    await session.flush()
    view = await get_user_by_email(session, target_email)
    assert view is not None
    return view


async def assign_role(
    session: AsyncSession,
    *,
    target_email: str,
    requester_email: str,
    role_id: str,
) -> UserView:
    if target_email == requester_email:
        raise SelfEditNotAllowed('cannot edit your own roles')
    user = (
        await session.execute(select(LbUser).where(LbUser.email == target_email))
    ).scalar_one_or_none()
    if user is None:
        raise NotFound(f'user {target_email}')
    role = (
        await session.execute(select(LbRole).where(LbRole.id == role_id))
    ).scalar_one_or_none()
    if role is None:
        raise NotFound(f'role {role_id}')
    exists = (
        await session.execute(
            select(LbUserRole)
            .where(LbUserRole.user_id == user.id)
            .where(LbUserRole.role_id == role_id)
        )
    ).scalar_one_or_none()
    if exists is None:
        session.add(LbUserRole(user_id=user.id, role_id=role_id))
        await session.flush()
    view = await get_user_by_email(session, target_email)
    assert view is not None
    return view


async def remove_role(
    session: AsyncSession,
    *,
    target_email: str,
    requester_email: str,
    role_id: str,
) -> UserView:
    if target_email == requester_email:
        raise SelfEditNotAllowed('cannot edit your own roles')
    user = (
        await session.execute(select(LbUser).where(LbUser.email == target_email))
    ).scalar_one_or_none()
    if user is None:
        raise NotFound(f'user {target_email}')

    # If removing super_admin, ensure another enabled super_admin still exists.
    if role_id == SUPER_ADMIN_ROLE_ID:
        remaining = await _count_enabled_super_admins(
            session, excluding_user_id=user.id
        )
        if remaining == 0:
            raise MinSuperAdminViolation('at least one enabled super_admin must remain')

    await session.execute(
        delete(LbUserRole)
        .where(LbUserRole.user_id == user.id)
        .where(LbUserRole.role_id == role_id)
    )
    await session.flush()
    view = await get_user_by_email(session, target_email)
    assert view is not None
    return view


# ---------- Roles ----------------------------------------------------------


async def list_roles(session: AsyncSession) -> list[RoleView]:
    result = await session.execute(
        select(LbRole, LbRolePermission).join(
            LbRolePermission, LbRolePermission.role_id == LbRole.id, isouter=True
        )
    )
    by_role: dict[str, RoleView] = {}
    for r, p in result.all():
        view = by_role.get(r.id)
        if view is None:
            view = RoleView(
                id=r.id,
                name=r.name,
                description=r.description,
                is_system=r.is_system,
                is_enabled=r.is_enabled,
                created_at=r.created_at,
            )
            by_role[r.id] = view
        if p is not None:
            view.permissions.append(p.permission)
    roles = list(by_role.values())
    roles.sort(key=lambda v: (not v.is_system, v.name))
    return roles


async def create_role(
    session: AsyncSession,
    *,
    name: str,
    description: str | None,
    permissions: list[str] | None = None,
) -> RoleView:
    name = name.strip()
    if not name:
        raise ValueError('name is required')
    if name == SUPER_ADMIN_ROLE_NAME:
        raise SystemRoleImmutable('cannot create another super_admin role')
    existing = (
        await session.execute(select(LbRole).where(LbRole.name == name))
    ).scalar_one_or_none()
    if existing is not None:
        raise ValueError(f'role {name!r} already exists')
    role = LbRole(
        id=_new_id(),
        name=name,
        description=description,
        is_system=False,
        is_enabled=True,
        created_at=_utcnow(),
    )
    session.add(role)
    await session.flush()
    if permissions:
        for p in set(permissions):
            session.add(LbRolePermission(role_id=role.id, permission=p))
        await session.flush()
    return RoleView(
        id=role.id,
        name=role.name,
        description=role.description,
        is_system=False,
        is_enabled=True,
        created_at=role.created_at,
        permissions=list(set(permissions or [])),
    )


async def update_role(
    session: AsyncSession,
    *,
    role_id: str,
    name: str | None = None,
    description: str | None = None,
    is_enabled: bool | None = None,
) -> RoleView:
    role = (
        await session.execute(select(LbRole).where(LbRole.id == role_id))
    ).scalar_one_or_none()
    if role is None:
        raise NotFound(f'role {role_id}')
    if role.is_system:
        raise SystemRoleImmutable(
            f'role {role.name!r} is a system role and cannot be edited'
        )
    if name is not None:
        new_name = name.strip()
        if new_name == SUPER_ADMIN_ROLE_NAME:
            raise SystemRoleImmutable('cannot rename to super_admin')
        role.name = new_name
    if description is not None:
        role.description = description
    if is_enabled is not None:
        role.is_enabled = is_enabled
    await session.flush()
    perms = [
        p.permission
        for p in (
            await session.execute(
                select(LbRolePermission).where(LbRolePermission.role_id == role.id)
            )
        ).scalars()
    ]
    return RoleView(
        id=role.id,
        name=role.name,
        description=role.description,
        is_system=role.is_system,
        is_enabled=role.is_enabled,
        created_at=role.created_at,
        permissions=perms,
    )


async def delete_role(session: AsyncSession, *, role_id: str) -> None:
    role = (
        await session.execute(select(LbRole).where(LbRole.id == role_id))
    ).scalar_one_or_none()
    if role is None:
        raise NotFound(f'role {role_id}')
    if role.is_system:
        raise SystemRoleImmutable(
            f'role {role.name!r} is a system role and cannot be deleted'
        )
    # Detach from any users first (ondelete=RESTRICT on the FK).
    await session.execute(delete(LbUserRole).where(LbUserRole.role_id == role_id))
    await session.execute(delete(LbRole).where(LbRole.id == role_id))
    await session.flush()


async def set_role_permissions(
    session: AsyncSession, *, role_id: str, permissions: list[str]
) -> RoleView:
    role = (
        await session.execute(select(LbRole).where(LbRole.id == role_id))
    ).scalar_one_or_none()
    if role is None:
        raise NotFound(f'role {role_id}')
    if role.is_system:
        raise SystemRoleImmutable(
            f'role {role.name!r} is a system role; permissions are implicit'
        )
    await session.execute(
        delete(LbRolePermission).where(LbRolePermission.role_id == role_id)
    )
    for p in set(permissions):
        session.add(LbRolePermission(role_id=role_id, permission=p))
    await session.flush()
    return RoleView(
        id=role.id,
        name=role.name,
        description=role.description,
        is_system=False,
        is_enabled=role.is_enabled,
        created_at=role.created_at,
        permissions=list(set(permissions)),
    )


# ---------- Permission checks ----------------------------------------------


async def has_permission(session: AsyncSession, *, email: str, permission: str) -> bool:
    """True if the user holds any role granting `permission`, or holds
    the super_admin sys role (which bypasses all checks)."""
    if not email:
        return False
    user = (
        await session.execute(
            select(LbUser)
            .where(LbUser.email == email)
            .where(LbUser.is_enabled.is_(True))
        )
    ).scalar_one_or_none()
    if user is None:
        return False
    is_sa = (
        await session.execute(
            select(func.count())
            .select_from(LbUserRole)
            .where(LbUserRole.user_id == user.id)
            .where(LbUserRole.role_id == SUPER_ADMIN_ROLE_ID)
        )
    ).scalar_one() > 0
    if is_sa:
        return True
    granted = (
        await session.execute(
            select(func.count())
            .select_from(LbRolePermission)
            .join(LbUserRole, LbUserRole.role_id == LbRolePermission.role_id)
            .join(LbRole, LbRole.id == LbUserRole.role_id)
            .where(LbUserRole.user_id == user.id)
            .where(LbRole.is_enabled.is_(True))
            .where(LbRolePermission.permission == permission)
        )
    ).scalar_one()
    return granted > 0


async def get_user_permissions(session: AsyncSession, email: str) -> list[str]:
    """Return the union of permission strings granted to this user by all
    their enabled roles. Empty list for anonymous, disabled, or
    unknown users. Super_admin returns []; the caller should branch on
    is_super_admin() separately (the sys role bypasses checks, so it's
    not represented by a permission string)."""
    if not email:
        return []
    user = (
        await session.execute(
            select(LbUser)
            .where(LbUser.email == email)
            .where(LbUser.is_enabled.is_(True))
        )
    ).scalar_one_or_none()
    if user is None:
        return []
    rows = (
        await session.execute(
            select(LbRolePermission.permission)
            .join(LbUserRole, LbUserRole.role_id == LbRolePermission.role_id)
            .join(LbRole, LbRole.id == LbUserRole.role_id)
            .where(LbUserRole.user_id == user.id)
            .where(LbRole.is_enabled.is_(True))
            .distinct()
        )
    ).all()
    return sorted({r[0] for r in rows})


async def is_super_admin(session: AsyncSession, email: str) -> bool:
    """True if `email` resolves to an enabled user holding super_admin."""
    if not email:
        return False
    result = (
        await session.execute(
            select(func.count())
            .select_from(LbUser)
            .join(LbUserRole, LbUserRole.user_id == LbUser.id)
            .where(LbUser.email == email)
            .where(LbUser.is_enabled.is_(True))
            .where(LbUserRole.role_id == SUPER_ADMIN_ROLE_ID)
        )
    ).scalar_one()
    return result > 0
