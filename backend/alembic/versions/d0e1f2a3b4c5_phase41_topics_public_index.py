"""Phase 4.1 topics and public_articles search index

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-10-20 20:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d0e1f2a3b4c5"
down_revision: str | Sequence[str] | None = "c9d0e1f2a3b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

language_code = postgresql.ENUM(name="language_code", create_type=False)
public_verdict = postgresql.ENUM(name="public_verdict", create_type=False)


def upgrade() -> None:
    op.create_table(
        "topics",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("name_bo", sa.String(length=500), nullable=False),
        sa.Column("name_en", sa.String(length=500), nullable=False),
        sa.Column("description_bo", sa.Text(), nullable=True),
        sa.Column("description_en", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("slug_immutable", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_topics_slug"),
    )
    op.create_index("ix_topics_position", "topics", ["position"])

    op.create_table(
        "fact_check_topics",
        sa.Column("fact_check_id", sa.UUID(), nullable=False),
        sa.Column("topic_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["fact_check_id"], ["fact_checks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("fact_check_id", "topic_id"),
    )
    op.create_index("ix_fact_check_topics_topic_id", "fact_check_topics", ["topic_id"])

    op.create_table(
        "public_articles",
        sa.Column("content_id", sa.UUID(), nullable=False),
        sa.Column("fact_check_id", sa.UUID(), nullable=False),
        sa.Column("language", language_code, nullable=False),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("live_version_id", sa.UUID(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("verdict", public_verdict, nullable=False),
        sa.Column("topics", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
        sa.Column("first_published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_withdrawn", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("search_text", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "search_tokens",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.ForeignKeyConstraint(["content_id"], ["fact_check_contents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["fact_check_id"], ["fact_checks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["live_version_id"], ["article_versions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("content_id"),
    )
    op.create_index(
        "ix_public_articles_slug_language",
        "public_articles",
        ["slug", "language"],
        unique=True,
    )
    op.create_index(
        "ix_public_articles_list",
        "public_articles",
        ["language", "is_withdrawn", "last_published_at"],
    )
    op.create_index("ix_public_articles_verdict", "public_articles", ["verdict"])
    op.execute(
        "CREATE INDEX ix_public_articles_search_text_trgm "
        "ON public_articles USING gin (search_text gin_trgm_ops)"
    )
    op.execute("CREATE INDEX ix_public_articles_search_tokens ON public_articles USING gin (search_tokens)")
    op.execute("CREATE INDEX ix_public_articles_topics ON public_articles USING gin (topics)")


def downgrade() -> None:
    op.drop_index("ix_public_articles_topics", table_name="public_articles")
    op.drop_index("ix_public_articles_search_tokens", table_name="public_articles")
    op.drop_index("ix_public_articles_search_text_trgm", table_name="public_articles")
    op.drop_index("ix_public_articles_verdict", table_name="public_articles")
    op.drop_index("ix_public_articles_list", table_name="public_articles")
    op.drop_index("ix_public_articles_slug_language", table_name="public_articles")
    op.drop_table("public_articles")
    op.drop_index("ix_fact_check_topics_topic_id", table_name="fact_check_topics")
    op.drop_table("fact_check_topics")
    op.drop_index("ix_topics_position", table_name="topics")
    op.drop_table("topics")
