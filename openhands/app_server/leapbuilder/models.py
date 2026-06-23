"""SQLAlchemy ORM models for LeapBuilder M11 v1 RBAC.

Models mirror the migration 011 schema:
  - LbUser: users (every authenticated identity)
  - LbRole: role definitions; `is_system=True` = bypass + undeletable
  - LbRolePermission: free-form permission strings per role
  - LbUserRole: user ↔ role association

The `super_admin` role has a fixed UUID (SUPER_ADMIN_ROLE_ID) so callers
can compare without a DB lookup.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from openhands.app_server.utils.sql_utils import Base


SUPER_ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000001'
SUPER_ADMIN_ROLE_NAME = 'super_admin'


class LbUser(Base):
    __tablename__ = 'lb_users'

    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    github_login: Mapped[str | None] = mapped_column(String, nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class LbRole(Base):
    __tablename__ = 'lb_roles'

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class LbRolePermission(Base):
    __tablename__ = 'lb_role_permissions'

    role_id: Mapped[str] = mapped_column(
        String, ForeignKey('lb_roles.id', ondelete='CASCADE'), primary_key=True
    )
    permission: Mapped[str] = mapped_column(String, primary_key=True)


class LbUserRole(Base):
    __tablename__ = 'lb_user_roles'

    user_id: Mapped[str] = mapped_column(
        String, ForeignKey('lb_users.id', ondelete='CASCADE'), primary_key=True
    )
    role_id: Mapped[str] = mapped_column(
        String, ForeignKey('lb_roles.id', ondelete='RESTRICT'), primary_key=True
    )
