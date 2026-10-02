"""LB M9.3b — add created_by_user_id to conversation_metadata

Revision ID: 010
Revises: 009
Create Date: 2026-06-14 00:00:00.000000

LeapBuilder runs OpenHands behind oauth2-proxy and propagates per-user
identity (M9.3). Conversations need a user_id column so the OSS
sql_app_conversation_info_service can filter "my conversations" instead
of leaking the global list to every signed-in user.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '010'
down_revision: Union[str, None] = '009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # `index=True` on the column triggers the index creation automatically —
    # no explicit op.create_index needed (and adding one duplicates the
    # ix_conversation_metadata_created_by_user_id index → "already exists"
    # error at the next startup).
    op.add_column(
        'conversation_metadata',
        sa.Column('created_by_user_id', sa.String, nullable=True, index=True),
    )


def downgrade() -> None:
    op.drop_column('conversation_metadata', 'created_by_user_id')
