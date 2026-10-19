"""Shared FastAPI dependencies."""

from collections.abc import AsyncIterator

from fastapi import HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.lifecycle import get_session_factory


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
