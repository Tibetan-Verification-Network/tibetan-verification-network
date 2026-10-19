"""Archive metadata and explicit access grants."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.enums import ArchiveVisibility
from app.db.mixins import TimestampMixin, UserAuditMixin, UUIDPrimaryKeyMixin
from app.db.types import pg_enum


class ArchiveDocument(UUIDPrimaryKeyMixin, TimestampMixin, UserAuditMixin, Base):
    __tablename__ = "archive_documents"

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    visibility: Mapped[ArchiveVisibility] = mapped_column(
        pg_enum(ArchiveVisibility, name="archive_visibility"),
        default=ArchiveVisibility.INTERNAL,
        nullable=False,
    )
    storage_key: Mapped[str | None] = mapped_column(String(500))
    mime_type: Mapped[str | None] = mapped_column(String(120))
    byte_size: Mapped[int | None] = mapped_column(BigInteger)

    access_grants: Mapped[list[AccessGrant]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_archive_documents_visibility", "visibility"),
        Index("ix_archive_documents_created_at", "created_at"),
    )


class AccessGrant(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "access_grants"

    archive_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("archive_documents.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    granted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    document: Mapped[ArchiveDocument] = relationship(back_populates="access_grants")

    __table_args__ = (
        UniqueConstraint(
            "archive_document_id",
            "user_id",
            name="uq_access_grants_document_user",
        ),
        Index("ix_access_grants_user_id", "user_id"),
    )
