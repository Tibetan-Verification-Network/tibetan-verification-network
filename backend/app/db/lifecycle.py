"""Application lifespan hooks for database engine management."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.db.session import create_engine, create_session_factory


@asynccontextmanager
async def database_lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = app.state.settings
    if not isinstance(settings, Settings):
        yield
        return
    engine = create_engine(settings.database_url.get_secret_value())
    session_factory = create_session_factory(engine)
    app.state.db_engine = engine
    app.state.db_session_factory = session_factory
    try:
        yield
    finally:
        await engine.dispose()
        app.state.db_engine = None
        app.state.db_session_factory = None


def get_engine(app: FastAPI) -> AsyncEngine | None:
    engine = getattr(app.state, "db_engine", None)
    return engine if isinstance(engine, AsyncEngine) else None


def get_session_factory(app: FastAPI) -> async_sessionmaker[AsyncSession] | None:
    factory = getattr(app.state, "db_session_factory", None)
    if not isinstance(factory, async_sessionmaker):
        return None
    return factory
