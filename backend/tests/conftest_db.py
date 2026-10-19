"""PostgreSQL fixtures for schema and model tests."""

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.db.session import create_session_factory
from tests.db_helpers import postgres_is_available, prepare_engine, resolve_test_database_url


@pytest_asyncio.fixture(scope="session")
async def test_engine() -> AsyncIterator[AsyncEngine]:
    database_url = resolve_test_database_url()
    if not await postgres_is_available(database_url):
        pytest.skip("PostgreSQL is not available for database tests")
    engine = await prepare_engine(database_url)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    factory = create_session_factory(test_engine)
    async with test_engine.connect() as connection:
        transaction = await connection.begin()
        session = factory(bind=connection, join_transaction_mode="create_savepoint")
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()
