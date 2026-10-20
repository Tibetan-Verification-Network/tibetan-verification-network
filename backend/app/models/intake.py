"""Public intake and canonical claims."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.enums import SubmissionChannel, WorkflowStatus
from app.db.mixins import TimestampMixin, UserAuditMixin, UUIDPrimaryKeyMixin
from app.db.types import pg_enum

if TYPE_CHECKING:
    from app.models.research import Investigation


class Claim(UUIDPrimaryKeyMixin, TimestampMixin, UserAuditMixin, Base):
    __tablename__ = "claims"

    canonical_text: Mapped[str] = mapped_column(Text, nullable=False)
    context_summary: Mapped[str | None] = mapped_column(Text)
    internal_slug: Mapped[str | None] = mapped_column(String(120))

    submissions: Mapped[list[Submission]] = relationship(back_populates="claim")
    investigations: Mapped[list[Investigation]] = relationship(back_populates="claim")

    __table_args__ = (
        UniqueConstraint("internal_slug", name="uq_claims_internal_slug"),
        Index("ix_claims_created_at", "created_at"),
    )


class Submission(UUIDPrimaryKeyMixin, TimestampMixin, UserAuditMixin, Base):
    __tablename__ = "submissions"

    claim_text: Mapped[str] = mapped_column(Text, nullable=False)
    context_text: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(String(2048))
    channel: Mapped[SubmissionChannel] = mapped_column(
        pg_enum(SubmissionChannel, name="submission_channel"),
        default=SubmissionChannel.PUBLIC_FORM,
        nullable=False,
    )
    workflow_status: Mapped[WorkflowStatus] = mapped_column(
        pg_enum(WorkflowStatus, name="workflow_status"),
        default=WorkflowStatus.INBOX,
        nullable=False,
    )
    claim_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("claims.id", ondelete="SET NULL"),
    )
    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    triaged_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    triaged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    triage_note: Mapped[str | None] = mapped_column(Text)
    duplicate_of_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submissions.id", ondelete="SET NULL"),
    )
    text_fingerprint: Mapped[str | None] = mapped_column(String(64))
    submitter_key_hash: Mapped[str | None] = mapped_column(String(64))

    claim: Mapped[Claim | None] = relationship(back_populates="submissions")
    duplicate_of: Mapped[Submission | None] = relationship(
        remote_side="Submission.id",
        foreign_keys=[duplicate_of_id],
    )
    contact: Mapped[SubmissionContact | None] = relationship(
        back_populates="submission",
        uselist=False,
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_submissions_workflow_status", "workflow_status"),
        Index("ix_submissions_created_at", "created_at"),
        Index("ix_submissions_claim_id", "claim_id"),
        Index("ix_submissions_text_fingerprint", "text_fingerprint"),
        Index("ix_submissions_assigned_to_id", "assigned_to_id"),
    )


class SubmissionContact(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Submitter contact details kept separate from editorial claim text."""

    __tablename__ = "submission_contacts"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("submissions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    contact_name: Mapped[str | None] = mapped_column(String(200))
    contact_email: Mapped[str | None] = mapped_column(String(320))
    contact_phone: Mapped[str | None] = mapped_column(String(40))
    privacy_notice_acknowledged: Mapped[bool] = mapped_column(default=False, nullable=False)

    submission: Mapped[Submission] = relationship(back_populates="contact")
