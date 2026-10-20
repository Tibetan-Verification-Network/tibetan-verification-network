"""Fact-check editorial and publication metadata."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.enums import (
    ArticleVersionKind,
    LanguageCode,
    LanguageEditorialStatus,
    PublicVerdict,
    ReviewDecision,
    TranslationStatus,
    WorkflowStatus,
)
from app.db.mixins import TimestampMixin, UserAuditMixin, UUIDPrimaryKeyMixin
from app.db.types import pg_enum

if TYPE_CHECKING:
    from app.models.research import Investigation, Source


class FactCheck(UUIDPrimaryKeyMixin, TimestampMixin, UserAuditMixin, Base):
    __tablename__ = "fact_checks"

    investigation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("investigations.id", ondelete="SET NULL"),
        unique=True,
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    public_slug: Mapped[str | None] = mapped_column(String(160))
    workflow_status: Mapped[WorkflowStatus] = mapped_column(
        pg_enum(WorkflowStatus, name="workflow_status"),
        default=WorkflowStatus.DRAFTING,
        nullable=False,
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    investigation: Mapped[Investigation | None] = relationship(back_populates="fact_check")
    contents: Mapped[list[FactCheckContent]] = relationship(
        back_populates="fact_check",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("public_slug", name="uq_fact_checks_public_slug"),
        Index("ix_fact_checks_workflow_status", "workflow_status"),
        Index("ix_fact_checks_published_at", "published_at"),
    )


class FactCheckContent(UUIDPrimaryKeyMixin, TimestampMixin, UserAuditMixin, Base):
    """Language-specific editorial and public copy."""

    __tablename__ = "fact_check_contents"

    fact_check_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("fact_checks.id", ondelete="CASCADE"),
        nullable=False,
    )
    language: Mapped[LanguageCode] = mapped_column(
        pg_enum(LanguageCode, name="language_code"),
        nullable=False,
    )
    editorial_status: Mapped[LanguageEditorialStatus] = mapped_column(
        pg_enum(LanguageEditorialStatus, name="language_editorial_status"),
        default=LanguageEditorialStatus.DRAFT,
        nullable=False,
    )
    translation_status: Mapped[TranslationStatus] = mapped_column(
        pg_enum(TranslationStatus, name="translation_status"),
        default=TranslationStatus.PENDING,
        nullable=False,
    )
    title: Mapped[str | None] = mapped_column(String(500))
    summary: Mapped[str | None] = mapped_column(Text)
    claim_text: Mapped[str | None] = mapped_column(Text)
    context_text: Mapped[str | None] = mapped_column(Text)
    analysis_markdown: Mapped[str | None] = mapped_column(Text)
    limitations_markdown: Mapped[str | None] = mapped_column(Text)
    verdict: Mapped[PublicVerdict | None] = mapped_column(
        pg_enum(PublicVerdict, name="public_verdict"),
    )
    verdict_explanation: Mapped[str | None] = mapped_column(Text)
    current_revision_number: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cycle_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pending_version_kind: Mapped[ArticleVersionKind | None] = mapped_column(
        pg_enum(ArticleVersionKind, name="article_version_kind"),
    )
    live_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("article_versions.id", ondelete="RESTRICT"),
    )
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    fact_check: Mapped[FactCheck] = relationship(back_populates="contents")
    live_version: Mapped[ArticleVersion | None] = relationship(
        foreign_keys=[live_version_id],
    )
    reviews: Mapped[list[Review]] = relationship(
        back_populates="content",
        cascade="all, delete-orphan",
    )
    article_versions: Mapped[list[ArticleVersion]] = relationship(
        back_populates="content",
        foreign_keys="ArticleVersion.fact_check_content_id",
        cascade="all, delete-orphan",
    )
    revisions: Mapped[list[FactCheckContentRevision]] = relationship(
        back_populates="content",
        cascade="all, delete-orphan",
    )
    source_links: Mapped[list[FactCheckContentSource]] = relationship(
        back_populates="content",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint(
            "fact_check_id",
            "language",
            name="uq_fact_check_contents_fact_check_language",
        ),
        CheckConstraint(
            "(editorial_status != 'published') OR (live_version_id IS NOT NULL)",
            name="ck_fact_check_contents_published_requires_live_version",
        ),
        Index("ix_fact_check_contents_language", "language"),
        Index("ix_fact_check_contents_editorial_status", "editorial_status"),
        Index("ix_fact_check_contents_verdict", "verdict"),
        Index("ix_fact_check_contents_published_at", "published_at"),
    )


class FactCheckContentRevision(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "fact_check_content_revisions"

    content_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("fact_check_contents.id", ondelete="CASCADE"),
        nullable=False,
    )
    revision_number: Mapped[int] = mapped_column(nullable=False)
    fields: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    checksum: Mapped[str] = mapped_column(String(128), nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    content: Mapped[FactCheckContent] = relationship(back_populates="revisions")

    __table_args__ = (
        UniqueConstraint(
            "content_id",
            "revision_number",
            name="uq_fact_check_content_revisions_content_revision",
        ),
        Index("ix_fact_check_content_revisions_content_id", "content_id"),
    )


class FactCheckContentSource(Base):
    __tablename__ = "fact_check_content_sources"

    content_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("fact_check_contents.id", ondelete="CASCADE"),
        primary_key=True,
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sources.id", ondelete="CASCADE"),
        primary_key=True,
    )
    relevance_note: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(nullable=False, default=0)

    content: Mapped[FactCheckContent] = relationship(back_populates="source_links")
    source: Mapped[Source] = relationship()


class Review(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "reviews"

    fact_check_content_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("fact_check_contents.id", ondelete="CASCADE"),
        nullable=False,
    )
    reviewer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    decision: Mapped[ReviewDecision] = mapped_column(
        pg_enum(ReviewDecision, name="review_decision"),
        nullable=False,
    )
    comments: Mapped[str | None] = mapped_column(Text)
    revision_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("fact_check_content_revisions.id", ondelete="RESTRICT"),
    )
    invalidated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    invalidated_reason: Mapped[str | None] = mapped_column(Text)

    content: Mapped[FactCheckContent] = relationship(back_populates="reviews")
    revision: Mapped[FactCheckContentRevision | None] = relationship()

    __table_args__ = (Index("ix_reviews_fact_check_content_id", "fact_check_content_id"),)


class ArticleVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Immutable-ready publication snapshot metadata."""

    __tablename__ = "article_versions"

    fact_check_content_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("fact_check_contents.id", ondelete="RESTRICT"),
        nullable=False,
    )
    fact_check_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("fact_checks.id", ondelete="RESTRICT"),
        nullable=False,
    )
    language: Mapped[LanguageCode] = mapped_column(
        pg_enum(LanguageCode, name="language_code"),
        nullable=False,
    )
    revision_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("fact_check_content_revisions.id", ondelete="RESTRICT"),
    )
    version_number: Mapped[int] = mapped_column(nullable=False)
    kind: Mapped[ArticleVersionKind] = mapped_column(
        pg_enum(ArticleVersionKind, name="article_version_kind"),
        nullable=False,
        default=ArticleVersionKind.INITIAL,
    )
    correction_note: Mapped[str | None] = mapped_column(Text)
    approval_review_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reviews.id", ondelete="RESTRICT"),
        nullable=False,
    )
    snapshot: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    published_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    content_checksum: Mapped[str] = mapped_column(String(128), nullable=False)

    content: Mapped[FactCheckContent] = relationship(
        back_populates="article_versions",
        foreign_keys=[fact_check_content_id],
    )
    approval_review: Mapped[Review] = relationship(foreign_keys=[approval_review_id])

    __table_args__ = (
        UniqueConstraint(
            "fact_check_content_id",
            "version_number",
            name="uq_article_versions_content_version",
        ),
        Index("ix_article_versions_published_at", "published_at"),
        Index("ix_article_versions_fact_check_id", "fact_check_id"),
    )
