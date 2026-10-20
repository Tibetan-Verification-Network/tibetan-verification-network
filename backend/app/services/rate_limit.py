"""Postgres-backed fixed-window rate limiting."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rate_limit import RateLimitCounter


def window_start_for(now: datetime, window_seconds: int) -> datetime:
    epoch = int(now.timestamp())
    start_epoch = epoch - (epoch % window_seconds)
    return datetime.fromtimestamp(start_epoch, tz=UTC)


async def increment_rate_limit(
    session: AsyncSession,
    *,
    bucket_key: str,
    window_seconds: int,
    max_count: int,
    now: datetime | None = None,
) -> bool:
    """Increment a counter and return True when the request is within the limit."""
    moment = now or datetime.now(UTC)
    window_start = window_start_for(moment, window_seconds)
    stmt = (
        insert(RateLimitCounter)
        .values(bucket_key=bucket_key, window_start=window_start, count=1)
        .on_conflict_do_update(
            constraint="uq_rate_limit_counters_bucket_window",
            set_={"count": RateLimitCounter.count + 1},
        )
        .returning(RateLimitCounter.count)
    )
    count = (await session.execute(stmt)).scalar_one()
    return count <= max_count
