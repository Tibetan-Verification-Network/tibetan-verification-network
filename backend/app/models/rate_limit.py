"""Postgres-backed rate limit counters (no Redis required)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.mixins import UUIDPrimaryKeyMixin


class RateLimitCounter(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "rate_limit_counters"

    bucket_key: Mapped[str] = mapped_column(String(256), nullable=False)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("bucket_key", "window_start", name="uq_rate_limit_counters_bucket_window"),
        Index("ix_rate_limit_counters_bucket_key", "bucket_key"),
    )
