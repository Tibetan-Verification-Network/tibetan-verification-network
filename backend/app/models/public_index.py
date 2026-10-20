"""Denormalized public read index (snapshot-derived only)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.enums import LanguageCode, PublicVerdict
from app.db.types import pg_enum


class PublicArticle(Base):
    """One row per published language; written only from the publication service."""

    __tablename__ = "public_articles"

    content_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("fact_check_contents.id", ondelete="CASCADE"),
        primary_key=True,
    )
    fact_check_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("fact_checks.id", ondelete="CASCADE"),
        nullable=False,
    )
    language: Mapped[LanguageCode] = mapped_column(
        pg_enum(LanguageCode, name="language_code"),
        nullable=False,
    )
    slug: Mapped[str] = mapped_column(String(160), nullable=False)
    live_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("article_versions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    verdict: Mapped[PublicVerdict] = mapped_column(
        pg_enum(PublicVerdict, name="public_verdict"),
        nullable=False,
    )
    topics: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    first_published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_withdrawn: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    search_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    search_tokens: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)

    __table_args__ = (
        Index("ix_public_articles_slug_language", "slug", "language", unique=True),
        Index(
            "ix_public_articles_list",
            "language",
            "is_withdrawn",
            "last_published_at",
        ),
        Index("ix_public_articles_verdict", "verdict"),
    )
