"""Staff-managed topics and fact-check assignments."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.publication import FactCheck


class Topic(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "topics"

    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    name_bo: Mapped[str] = mapped_column(String(500), nullable=False)
    name_en: Mapped[str] = mapped_column(String(500), nullable=False)
    description_bo: Mapped[str | None] = mapped_column(Text)
    description_en: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    slug_immutable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    fact_check_links: Mapped[list[FactCheckTopic]] = relationship(
        back_populates="topic",
        cascade="all, delete-orphan",
    )

    __table_args__ = (Index("ix_topics_position", "position"),)


class FactCheckTopic(Base):
    __tablename__ = "fact_check_topics"

    fact_check_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("fact_checks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    topic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("topics.id", ondelete="RESTRICT"),
        primary_key=True,
    )

    fact_check: Mapped[FactCheck] = relationship(back_populates="topic_links")
    topic: Mapped[Topic] = relationship(back_populates="fact_check_links")

    __table_args__ = (Index("ix_fact_check_topics_topic_id", "topic_id"),)
