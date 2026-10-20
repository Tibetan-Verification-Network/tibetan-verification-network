"""phase 3.1 workflow schema and immutability triggers

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-10-20 18:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b7c8d9e0f1a2"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

workflow_status = postgresql.ENUM(name="workflow_status", create_type=False)
language_code = postgresql.ENUM(name="language_code", create_type=False)
language_editorial_status = postgresql.ENUM(name="language_editorial_status", create_type=False)
review_decision = postgresql.ENUM(name="review_decision", create_type=False)
article_version_kind = postgresql.ENUM(
    "initial",
    "correction",
    "update",
    "clarification",
    "withdrawal",
    name="article_version_kind",
    create_type=False,
)


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            "ALTER TYPE language_editorial_status ADD VALUE IF NOT EXISTS 'ready_for_approval'"
        )
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE language_editorial_status ADD VALUE IF NOT EXISTS 'withdrawn'")
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE review_decision ADD VALUE IF NOT EXISTS 'mark_ready'")

    op.execute(
        "CREATE TYPE article_version_kind AS ENUM ("
        "'initial', 'correction', 'update', 'clarification', 'withdrawal'"
        ")"
    )

    op.add_column(
        "investigations",
        sa.Column("hold_from_status", workflow_status, nullable=True),
    )

    op.create_table(
        "fact_check_content_revisions",
        sa.Column("content_id", sa.UUID(), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("fields", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("checksum", sa.String(length=128), nullable=False),
        sa.Column("created_by_id", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["content_id"], ["fact_check_contents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "content_id",
            "revision_number",
            name="uq_fact_check_content_revisions_content_revision",
        ),
    )
    op.create_index(
        "ix_fact_check_content_revisions_content_id",
        "fact_check_content_revisions",
        ["content_id"],
        unique=False,
    )

    op.add_column("fact_check_contents", sa.Column("limitations_markdown", sa.Text(), nullable=True))
    op.add_column(
        "fact_check_contents",
        sa.Column("current_revision_number", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "fact_check_contents",
        sa.Column("cycle_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("fact_check_contents", sa.Column("live_version_id", sa.UUID(), nullable=True))
    op.add_column(
        "fact_check_contents",
        sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "fact_check_content_sources",
        sa.Column("content_id", sa.UUID(), nullable=False),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("relevance_note", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(["content_id"], ["fact_check_contents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("content_id", "source_id"),
    )

    op.add_column("reviews", sa.Column("revision_id", sa.UUID(), nullable=True))
    op.add_column("reviews", sa.Column("invalidated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("reviews", sa.Column("invalidated_reason", sa.Text(), nullable=True))
    op.create_foreign_key(
        "fk_reviews_revision_id_fact_check_content_revisions",
        "reviews",
        "fact_check_content_revisions",
        ["revision_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_reviews_one_active_approve_per_revision
        ON reviews (revision_id)
        WHERE decision = 'approve' AND invalidated_at IS NULL
        """
    )

    op.add_column("article_versions", sa.Column("fact_check_id", sa.UUID(), nullable=False))
    op.add_column("article_versions", sa.Column("language", language_code, nullable=False))
    op.add_column("article_versions", sa.Column("revision_id", sa.UUID(), nullable=True))
    op.add_column(
        "article_versions",
        sa.Column(
            "kind",
            article_version_kind,
            server_default="initial",
            nullable=False,
        ),
    )
    op.add_column("article_versions", sa.Column("correction_note", sa.Text(), nullable=True))
    op.add_column("article_versions", sa.Column("approval_review_id", sa.UUID(), nullable=True))
    op.execute("UPDATE article_versions SET content_checksum = '' WHERE content_checksum IS NULL")
    op.alter_column("article_versions", "content_checksum", existing_type=sa.String(128), nullable=False)

    bind = op.get_bind()
    article_version_count = bind.execute(sa.text("SELECT COUNT(*) FROM article_versions")).scalar()
    if article_version_count:
        raise RuntimeError("article_versions backfill required before phase 3.1 migration")

    op.alter_column("article_versions", "approval_review_id", nullable=False)
    op.create_foreign_key(
        "fk_article_versions_fact_check_id_fact_checks",
        "article_versions",
        "fact_checks",
        ["fact_check_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_article_versions_revision_id_fact_check_content_revisions",
        "article_versions",
        "fact_check_content_revisions",
        ["revision_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_article_versions_approval_review_id_reviews",
        "article_versions",
        "reviews",
        ["approval_review_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_article_versions_fact_check_id",
        "article_versions",
        ["fact_check_id"],
        unique=False,
    )

    op.create_foreign_key(
        "fk_fact_check_contents_live_version_id_article_versions",
        "fact_check_contents",
        "article_versions",
        ["live_version_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.create_check_constraint(
        "ck_fact_check_contents_published_requires_live_version",
        "fact_check_contents",
        "(editorial_status != 'published') OR (live_version_id IS NOT NULL)",
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION tvn_deny_mutations()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
        END;
        $$;
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION tvn_reviews_allow_invalidation_only()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            IF TG_OP = 'DELETE' THEN
                RAISE EXCEPTION 'reviews rows cannot be deleted';
            END IF;
            IF OLD.invalidated_at IS NOT NULL OR OLD.invalidated_reason IS NOT NULL THEN
                RAISE EXCEPTION 'reviews row is already invalidated';
            END IF;
            IF NEW.invalidated_at IS NULL OR NEW.invalidated_reason IS NULL THEN
                RAISE EXCEPTION 'reviews may only be updated to record invalidation';
            END IF;
            IF NEW.id IS DISTINCT FROM OLD.id
                OR NEW.fact_check_content_id IS DISTINCT FROM OLD.fact_check_content_id
                OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
                OR NEW.decision IS DISTINCT FROM OLD.decision
                OR NEW.comments IS DISTINCT FROM OLD.comments
                OR NEW.revision_id IS DISTINCT FROM OLD.revision_id
                OR NEW.created_at IS DISTINCT FROM OLD.created_at
                OR NEW.updated_at IS DISTINCT FROM OLD.updated_at
            THEN
                RAISE EXCEPTION 'reviews invalidation may not change other columns';
            END IF;
            RETURN NEW;
        END;
        $$;
        """
    )
    for table in (
        "audit_events",
        "article_versions",
        "fact_check_content_revisions",
    ):
        op.execute(
            f"""
            CREATE TRIGGER {table}_append_only
            BEFORE UPDATE OR DELETE ON {table}
            FOR EACH ROW EXECUTE FUNCTION tvn_deny_mutations();
            """
        )
    op.execute(
        """
        CREATE TRIGGER reviews_invalidation_only
        BEFORE UPDATE OR DELETE ON reviews
        FOR EACH ROW EXECUTE FUNCTION tvn_reviews_allow_invalidation_only();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS reviews_invalidation_only ON reviews")
    for table in (
        "fact_check_content_revisions",
        "article_versions",
        "audit_events",
    ):
        op.execute(f"DROP TRIGGER IF EXISTS {table}_append_only ON {table}")
    op.execute("DROP FUNCTION IF EXISTS tvn_reviews_allow_invalidation_only()")
    op.execute("DROP FUNCTION IF EXISTS tvn_deny_mutations()")

    op.drop_constraint(
        "ck_fact_check_contents_published_requires_live_version",
        "fact_check_contents",
        type_="check",
    )
    op.drop_constraint(
        "fk_fact_check_contents_live_version_id_article_versions",
        "fact_check_contents",
        type_="foreignkey",
    )
    op.drop_index("ix_article_versions_fact_check_id", table_name="article_versions")
    op.drop_constraint(
        "fk_article_versions_approval_review_id_reviews",
        "article_versions",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_article_versions_revision_id_fact_check_content_revisions",
        "article_versions",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_article_versions_fact_check_id_fact_checks",
        "article_versions",
        type_="foreignkey",
    )
    op.drop_column("article_versions", "approval_review_id")
    op.drop_column("article_versions", "correction_note")
    op.drop_column("article_versions", "kind")
    op.drop_column("article_versions", "revision_id")
    op.drop_column("article_versions", "language")
    op.drop_column("article_versions", "fact_check_id")
    op.alter_column("article_versions", "content_checksum", existing_type=sa.String(128), nullable=True)

    op.execute("DROP INDEX IF EXISTS uq_reviews_one_active_approve_per_revision")
    op.drop_constraint(
        "fk_reviews_revision_id_fact_check_content_revisions",
        "reviews",
        type_="foreignkey",
    )
    op.drop_column("reviews", "invalidated_reason")
    op.drop_column("reviews", "invalidated_at")
    op.drop_column("reviews", "revision_id")

    op.drop_table("fact_check_content_sources")

    op.drop_column("fact_check_contents", "withdrawn_at")
    op.drop_column("fact_check_contents", "live_version_id")
    op.drop_column("fact_check_contents", "cycle_started_at")
    op.drop_column("fact_check_contents", "current_revision_number")
    op.drop_column("fact_check_contents", "limitations_markdown")

    op.drop_index(
        "ix_fact_check_content_revisions_content_id",
        table_name="fact_check_content_revisions",
    )
    op.drop_table("fact_check_content_revisions")

    op.drop_column("investigations", "hold_from_status")

    op.execute("DROP TYPE article_version_kind")
