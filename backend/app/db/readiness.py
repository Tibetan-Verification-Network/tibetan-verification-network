"""Probe PostgreSQL for the readiness endpoint."""

import asyncio
import logging

import asyncpg
from sqlalchemy.ext.asyncio import AsyncEngine

import app.db.session as db_session
from app.db.url import to_async_sqlalchemy_url

_logger = logging.getLogger("app.db.readiness")


async def database_is_ready(
    database_url: str,
    timeout_seconds: float,
    *,
    engine: AsyncEngine | None = None,
) -> bool:
    """Return whether PostgreSQL accepts a trivial query."""
    if engine is not None:
        try:
            return await asyncio.wait_for(
                db_session.check_database(engine, timeout_seconds=timeout_seconds),
                timeout=timeout_seconds,
            )
        except Exception:
            _log_unavailable()
            return False
    connection = await _connect(_asyncpg_dsn(database_url), timeout_seconds)
    if connection is None:
        return False
    try:
        result = await asyncio.wait_for(connection.fetchval("SELECT 1"), timeout=timeout_seconds)
    except Exception:
        _log_unavailable()
        return False
    finally:
        await _close(connection)
    return isinstance(result, int) and result == 1


async def _connect(dsn: str, timeout_seconds: float) -> asyncpg.Connection | None:
    try:
        return await asyncpg.connect(dsn, timeout=timeout_seconds)
    except Exception:
        _log_unavailable()
        return None


async def _close(connection: asyncpg.Connection) -> None:
    try:
        await connection.close()
    except Exception:
        _log_unavailable()


def _asyncpg_dsn(database_url: str) -> str:
    normalized = to_async_sqlalchemy_url(database_url)
    if normalized.startswith("postgresql+asyncpg://"):
        return "postgresql://" + normalized.removeprefix("postgresql+asyncpg://")
    return normalized


def _log_unavailable() -> None:
    _logger.warning(
        "database readiness check failed",
        extra={"error_type": "database_unavailable"},
    )
