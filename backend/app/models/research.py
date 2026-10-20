"""Investigations, sources, evidence, and AI research runs."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.enums import EvidenceStance, ResearchRunStatus, WorkflowStatus
from app.db.mixins import TimestampMixin, UserAuditMixin, UUIDPrimaryKeyMixin
from app.db.types import pg_enum

if TYPE_CHECKING:
    from app.models.archive import ArchiveDocument
    from app.models.assignments import InvestigationAssignment
    from app.models.intake import Claim
    from app.models.publication import FactCheck


class Investigation(UUIDPrimaryKeyMixin, TimestampMixin, UserAuditMixin, Base):
    __tablename__ = "investigations"

    claim_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("claims.id", ondelete="RESTRICT"),
        nullable=False,
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    workflow_status: Mapped[WorkflowStatus] = mapped_column(
        pg_enum(WorkflowStatus, name="workflow_status"),
        default=WorkflowStatus.RESEARCHING,
        nullable=False,
    )
    internal_notes: Mapped[str | None] = mapped_column(Text)
    hold_reason: Mapped[str | None] = mapped_column(Text)
    reject_reason: Mapped[str | None] = mapped_column(Text)

    claim: Mapped[Claim] = relationship(back_populates="investigations")
    sources: Mapped[list[Source]] = relationship(
        back_populates="investigation",
        cascade="all, delete-orphan",
    )
    evidence_items: Mapped[list[EvidenceItem]] = relationship(
        back_populates="investigation",
        cascade="all, delete-orphan",
    )
    research_runs: Mapped[list[ResearchRun]] = relationship(
        back_populates="investigation",
        cascade="all, delete-orphan",
    )
    fact_check: Mapped[FactCheck | None] = relationship(
        back_populates="investigation",
        uselist=False,
    )
    assignments: Mapped[list[InvestigationAssignment]] = relationship(
        "InvestigationAssignment",
        back_populates="investigation",
        cascade="all, delete-orphan",
    )
    archive_documents: Mapped[list[ArchiveDocument]] = relationship(
        "ArchiveDocument",
        back_populates="investigation",
    )

    __table_args__ = (
        Index("ix_investigations_workflow_status", "workflow_status"),
        Index("ix_investigations_claim_id", "claim_id"),
        Index("ix_investigations_owner_id", "owner_id"),
    )


class Source(UUIDPrimaryKeyMixin, TimestampMixin, UserAuditMixin, Base):
    __tablename__ = "sources"

    investigation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("investigations.id", ondelete="CASCADE"),
        nullable=False,
    )
    url: Mapped[str | None] = mapped_column(String(2048))
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    publisher: Mapped[str | None] = mapped_column(String(300))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    author: Mapped[str | None] = mapped_column(String(300))
    source_language: Mapped[str | None] = mapped_column(String(40))
    reliability_notes: Mapped[str | None] = mapped_column(Text)
    normalized_url: Mapped[str | None] = mapped_column(String(2048))
    position: Mapped[int | None] = mapped_column(Integer)

    investigation: Mapped[Investigation] = relationship(back_populates="sources")
    evidence_items: Mapped[list[EvidenceItem]] = relationship(back_populates="source")

    __table_args__ = (Index("ix_sources_investigation_id", "investigation_id"),)


class EvidenceItem(UUIDPrimaryKeyMixin, TimestampMixin, UserAuditMixin, Base):
    __tablename__ = "evidence_items"

    investigation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("investigations.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sources.id", ondelete="SET NULL"),
    )
    archive_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("archive_documents.id", ondelete="SET NULL"),
    )
    excerpt: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    stance: Mapped[EvidenceStance | None] = mapped_column(
        pg_enum(EvidenceStance, name="evidence_stance"),
    )
    position: Mapped[int | None] = mapped_column(Integer)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verified_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    investigation: Mapped[Investigation] = relationship(back_populates="evidence_items")
    source: Mapped[Source | None] = relationship(back_populates="evidence_items")

    __table_args__ = (Index("ix_evidence_items_investigation_id", "investigation_id"),)


class ResearchRun(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "research_runs"

    investigation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("investigations.id", ondelete="CASCADE"),
        nullable=False,
    )
    triggered_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    provider: Mapped[str] = mapped_column(String(120), nullable=False)
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    task_type: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[ResearchRunStatus] = mapped_column(
        pg_enum(ResearchRunStatus, name="research_run_status"),
        default=ResearchRunStatus.PENDING,
        nullable=False,
    )
    prompt_version: Mapped[str | None] = mapped_column(String(80))
    output_text: Mapped[str | None] = mapped_column(Text)
    source_references: Mapped[dict[str, object] | None] = mapped_column(JSONB)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    investigation: Mapped[Investigation] = relationship(back_populates="research_runs")

    __table_args__ = (
        Index("ix_research_runs_investigation_id", "investigation_id"),
        Index("ix_research_runs_status", "status"),
    )
