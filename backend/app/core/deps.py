"""Shared FastAPI dependencies."""

from collections.abc import AsyncIterator

from typing import cast

from fastapi import HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.lifecycle import get_session_factory


def get_app_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


async def get_db_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Yield one request-scoped database session."""
    factory = get_session_factory(request.app)
    if factory is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not available",
        )
    session = factory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
