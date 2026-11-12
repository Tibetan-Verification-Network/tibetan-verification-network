"""selected approver on mark-ready reviews

Revision ID: e1f2a3b4c5d6
Revises: c9d0e1f2a3b4
Create Date: 2026-11-12 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: str | Sequence[str] | None = "d0e1f2a3b4c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "reviews",
        sa.Column("selected_approver_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_reviews_selected_approver_id_users",
        "reviews",
        "users",
        ["selected_approver_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_reviews_selected_approver_id", "reviews", ["selected_approver_id"])


def downgrade() -> None:
    op.drop_index("ix_reviews_selected_approver_id", table_name="reviews")
    op.drop_constraint("fk_reviews_selected_approver_id_users", "reviews", type_="foreignkey")
    op.drop_column("reviews", "selected_approver_id")
