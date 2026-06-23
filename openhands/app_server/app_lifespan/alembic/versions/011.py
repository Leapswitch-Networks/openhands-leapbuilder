"""LB M11 v1 — roles + permissions schema (lb_users / lb_roles / lb_role_permissions / lb_user_roles)

Revision ID: 011
Revises: 010
Create Date: 2026-06-17 00:00:00.000000

Adds a Postgres-backed identity + RBAC layer for LeapBuilder admins:

  - lb_users: every authenticated identity (replaces the JSON file
    users_store kept for the M6 v2 / M9 active-users tracker; the JSON
    file path stays compatible during the transition).
  - lb_roles: free-form role definitions. `is_system=True` rows (only
    `super_admin` at seed time) bypass all permission checks and are
    undeletable/uneditable.
  - lb_role_permissions: free-form string permissions per role.
  - lb_user_roles: many-to-many user ↔ role.

Bootstrap policy: the first authenticated user gets the `super_admin`
role auto-assigned. Invariant: at least one enabled super_admin must
exist at all times; the API enforces this on UPDATE/DELETE.

The `super_admin` row is seeded here so the API guard
("super_admin must exist") holds from the very first request after
this migration runs.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '011'
down_revision: Union[str, None] = '010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'lb_users',
        sa.Column('id', sa.String, primary_key=True),
        sa.Column('email', sa.String, nullable=False, unique=True),
        sa.Column('github_login', sa.String, nullable=True),
        sa.Column(
            'first_seen_at', sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column(
            'last_seen_at', sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column(
            'is_enabled',
            sa.Boolean,
            nullable=False,
            server_default=sa.text('true'),
        ),
    )
    op.create_index('ix_lb_users_email', 'lb_users', ['email'])

    op.create_table(
        'lb_roles',
        sa.Column('id', sa.String, primary_key=True),
        sa.Column('name', sa.String, nullable=False, unique=True),
        sa.Column('description', sa.String, nullable=True),
        sa.Column(
            'is_system',
            sa.Boolean,
            nullable=False,
            server_default=sa.text('false'),
        ),
        sa.Column(
            'is_enabled',
            sa.Boolean,
            nullable=False,
            server_default=sa.text('true'),
        ),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), nullable=False
        ),
    )

    op.create_table(
        'lb_role_permissions',
        sa.Column(
            'role_id',
            sa.String,
            sa.ForeignKey('lb_roles.id', ondelete='CASCADE'),
            primary_key=True,
        ),
        sa.Column('permission', sa.String, primary_key=True),
    )

    op.create_table(
        'lb_user_roles',
        sa.Column(
            'user_id',
            sa.String,
            sa.ForeignKey('lb_users.id', ondelete='CASCADE'),
            primary_key=True,
        ),
        sa.Column(
            'role_id',
            sa.String,
            sa.ForeignKey('lb_roles.id', ondelete='RESTRICT'),
            primary_key=True,
        ),
    )

    # Seed the super_admin sys role. Its UUID is fixed so the API and
    # tests can refer to it without a lookup.
    op.execute(
        """
        INSERT INTO lb_roles (id, name, description, is_system, is_enabled, created_at)
        VALUES (
            '00000000-0000-0000-0000-000000000001',
            'super_admin',
            'System role. Bypasses all permission checks. Auto-assigned to the first signed-in user. Cannot be edited or deleted via the UI.',
            true,
            true,
            CURRENT_TIMESTAMP
        )
        """
    )


def downgrade() -> None:
    op.drop_table('lb_user_roles')
    op.drop_table('lb_role_permissions')
    op.drop_table('lb_roles')
    op.drop_index('ix_lb_users_email', table_name='lb_users')
    op.drop_table('lb_users')
