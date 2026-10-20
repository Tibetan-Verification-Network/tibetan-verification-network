"""phase 2 access policy schema extensions

Revision ID: a1b2c3d4e5f6
Revises: f4fcda4b6a93
Create Date: 2026-10-20 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "f4fcda4b6a93"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

investigation_assignment_role = postgresql.ENUM(
    "owner",
    "contributor",
    name="investigation_assignment_role",
    create_type=False,
)
archive_upload_status = postgresql.ENUM(
    "pending",
    "available",
    "rejected",
    name="archive_upload_status",
    create_type=False,
)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.execute("CREATE TYPE investigation_assignment_role AS ENUM ('owner', 'contributor')")
    op.execute("CREATE TYPE archive_upload_status AS ENUM ('pending', 'available', 'rejected')")

    op.create_table(
        "investigation_assignments",
        sa.Column("investigation_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column(
            "assignment_role",
            investigation_assignment_role,
            nullable=False,
        ),
        sa.Column("assigned_by_id", sa.UUID(), nullable=True),
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
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
        sa.ForeignKeyConstraint(["assigned_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_investigation_assignments_investigation_id",
        "investigation_assignments",
        ["investigation_id"],
        unique=False,
    )
    op.create_index(
        "ix_investigation_assignments_user_id",
        "investigation_assignments",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "uq_investigation_assignments_active",
        "investigation_assignments",
        ["investigation_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("removed_at IS NULL"),
    )

    op.create_table(
        "rate_limit_counters",
        sa.Column("bucket_key", sa.String(length=256), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.UniqueConstraint(
            "bucket_key",
            "window_start",
            name="uq_rate_limit_counters_bucket_window",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_rate_limit_counters_bucket_key",
        "rate_limit_counters",
        ["bucket_key"],
        unique=False,
    )

    op.add_column("submissions", sa.Column("assigned_to_id", sa.UUID(), nullable=True))
    op.add_column("submissions", sa.Column("triaged_by_id", sa.UUID(), nullable=True))
    op.add_column("submissions", sa.Column("triaged_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("submissions", sa.Column("triage_note", sa.Text(), nullable=True))
    op.add_column("submissions", sa.Column("duplicate_of_id", sa.UUID(), nullable=True))
    op.add_column("submissions", sa.Column("text_fingerprint", sa.String(length=64), nullable=True))
    op.add_column(
        "submissions", sa.Column("submitter_key_hash", sa.String(length=64), nullable=True)
    )
    op.create_foreign_key(
        "fk_submissions_assigned_to_id_users",
        "submissions",
        "users",
        ["assigned_to_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_submissions_triaged_by_id_users",
        "submissions",
        "users",
        ["triaged_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_submissions_duplicate_of_id_submissions",
        "submissions",
        "submissions",
        ["duplicate_of_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_submissions_text_fingerprint", "submissions", ["text_fingerprint"], unique=False
    )
    op.create_index(
        "ix_submissions_assigned_to_id", "submissions", ["assigned_to_id"], unique=False
    )
    op.create_index(
        "ix_submissions_claim_text_trgm",
        "submissions",
        ["claim_text"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"claim_text": "gin_trgm_ops"},
    )

    op.add_column("sources", sa.Column("author", sa.String(length=300), nullable=True))
    op.add_column("sources", sa.Column("source_language", sa.String(length=40), nullable=True))
    op.add_column("sources", sa.Column("reliability_notes", sa.Text(), nullable=True))
    op.add_column("sources", sa.Column("normalized_url", sa.String(length=2048), nullable=True))
    op.add_column("sources", sa.Column("position", sa.Integer(), nullable=True))

    op.add_column("evidence_items", sa.Column("archive_document_id", sa.UUID(), nullable=True))
    op.add_column("evidence_items", sa.Column("position", sa.Integer(), nullable=True))
    op.add_column(
        "evidence_items", sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("evidence_items", sa.Column("verified_by_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_evidence_items_archive_document_id_archive_documents",
        "evidence_items",
        "archive_documents",
        ["archive_document_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_evidence_items_verified_by_id_users",
        "evidence_items",
        "users",
        ["verified_by_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column("archive_documents", sa.Column("investigation_id", sa.UUID(), nullable=True))
    op.add_column(
        "archive_documents", sa.Column("original_filename", sa.String(length=500), nullable=True)
    )
    op.add_column("archive_documents", sa.Column("sha256", sa.String(length=64), nullable=True))
    op.add_column(
        "archive_documents",
        sa.Column(
            "upload_status",
            archive_upload_status,
            server_default="pending",
            nullable=False,
        ),
    )
    op.add_column("archive_documents", sa.Column("classified_by_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_archive_documents_investigation_id_investigations",
        "archive_documents",
        "investigations",
        ["investigation_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_archive_documents_classified_by_id_users",
        "archive_documents",
        "users",
        ["classified_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_archive_documents_investigation_id",
        "archive_documents",
        ["investigation_id"],
        unique=False,
    )

    op.create_index(
        "ix_claims_canonical_text_trgm",
        "claims",
        ["canonical_text"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"canonical_text": "gin_trgm_ops"},
    )


def downgrade() -> None:
    op.drop_index("ix_claims_canonical_text_trgm", table_name="claims")
    op.drop_index("ix_archive_documents_investigation_id", table_name="archive_documents")
    op.drop_constraint(
        "fk_archive_documents_classified_by_id_users",
        "archive_documents",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_archive_documents_investigation_id_investigations",
        "archive_documents",
        type_="foreignkey",
    )
    op.drop_column("archive_documents", "classified_by_id")
    op.drop_column("archive_documents", "upload_status")
    op.drop_column("archive_documents", "sha256")
    op.drop_column("archive_documents", "original_filename")
    op.drop_column("archive_documents", "investigation_id")

    op.drop_constraint(
        "fk_evidence_items_verified_by_id_users", "evidence_items", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_evidence_items_archive_document_id_archive_documents",
        "evidence_items",
        type_="foreignkey",
    )
    op.drop_column("evidence_items", "verified_by_id")
    op.drop_column("evidence_items", "verified_at")
    op.drop_column("evidence_items", "position")
    op.drop_column("evidence_items", "archive_document_id")

    op.drop_column("sources", "position")
    op.drop_column("sources", "normalized_url")
    op.drop_column("sources", "reliability_notes")
    op.drop_column("sources", "source_language")
    op.drop_column("sources", "author")

    op.drop_index("ix_submissions_claim_text_trgm", table_name="submissions")
    op.drop_index("ix_submissions_assigned_to_id", table_name="submissions")
    op.drop_index("ix_submissions_text_fingerprint", table_name="submissions")
    op.drop_constraint(
        "fk_submissions_duplicate_of_id_submissions", "submissions", type_="foreignkey"
    )
    op.drop_constraint("fk_submissions_triaged_by_id_users", "submissions", type_="foreignkey")
    op.drop_constraint("fk_submissions_assigned_to_id_users", "submissions", type_="foreignkey")
    op.drop_column("submissions", "submitter_key_hash")
    op.drop_column("submissions", "text_fingerprint")
    op.drop_column("submissions", "duplicate_of_id")
    op.drop_column("submissions", "triage_note")
    op.drop_column("submissions", "triaged_at")
    op.drop_column("submissions", "triaged_by_id")
    op.drop_column("submissions", "assigned_to_id")

    op.drop_index("ix_rate_limit_counters_bucket_key", table_name="rate_limit_counters")
    op.drop_table("rate_limit_counters")

    op.drop_index("uq_investigation_assignments_active", table_name="investigation_assignments")
    op.drop_index("ix_investigation_assignments_user_id", table_name="investigation_assignments")
    op.drop_index(
        "ix_investigation_assignments_investigation_id",
        table_name="investigation_assignments",
    )
    op.drop_table("investigation_assignments")

    op.execute("DROP TYPE archive_upload_status")
    op.execute("DROP TYPE investigation_assignment_role")
