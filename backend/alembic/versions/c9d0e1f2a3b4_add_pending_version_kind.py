"""add pending_version_kind to fact_check_contents

Revision ID: c9d0e1f2a3b4
Revises: b7c8d9e0f1a2
Create Date: 2026-10-20 19:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c9d0e1f2a3b4"
down_revision: str | Sequence[str] | None = "b7c8d9e0f1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

article_version_kind = postgresql.ENUM(name="article_version_kind", create_type=False)


def upgrade() -> None:
    op.add_column(
        "fact_check_contents",
        sa.Column("pending_version_kind", article_version_kind, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("fact_check_contents", "pending_version_kind")
