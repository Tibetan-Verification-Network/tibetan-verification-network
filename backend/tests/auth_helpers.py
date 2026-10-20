"""Helpers for authentication integration tests."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.deps import get_db_session
from app.core.security import CSRF_HEADER_NAME
from app.db.session import create_session_factory
from tests.db_helpers import resolve_test_database_url
from tests.helpers import settings_for_tests


@pytest_asyncio.fixture
async def db_session_for_api(test_engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    factory = create_session_factory(test_engine)
    async with test_engine.connect() as connection:
        transaction = await connection.begin()
        session = factory(bind=connection, join_transaction_mode="create_savepoint")
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()


@pytest_asyncio.fixture
async def api_application(db_session_for_api: AsyncSession):
    from app.main import create_app

    database_url = resolve_test_database_url().replace("postgresql+asyncpg://", "postgresql://")
    from app.storage.memory import InMemoryStorage

    application = create_app(settings_for_tests(database_url=database_url))
    application.state.object_storage = InMemoryStorage()

    async def override_db() -> AsyncIterator[AsyncSession]:
        yield db_session_for_api

    application.dependency_overrides[get_db_session] = override_db
    yield application
    application.dependency_overrides.clear()


@pytest_asyncio.fixture
async def api_client(api_application) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=api_application)
    async with AsyncClient(transport=transport, base_url="http://testserver") as http:
        yield http


@pytest.fixture
def api_client_factory(api_application) -> Callable[[], AsyncIterator[AsyncClient]]:
    transport = ASGITransport(app=api_application)

    @asynccontextmanager
    async def _factory() -> AsyncIterator[AsyncClient]:
        async with AsyncClient(transport=transport, base_url="http://testserver") as http:
            yield http

    return _factory


def csrf_headers(csrf_token: str) -> dict[str, str]:
    return {
        CSRF_HEADER_NAME: csrf_token,
        "Origin": "http://localhost:5173",
    }


@pytest.fixture
def as_user(api_client_factory, db_session_for_api):
    """Log in as a freshly created user with the given roles."""

    @asynccontextmanager
    async def _as_user(
        *,
        roles,
        email: str | None = None,
        password: str = "correct-horse-battery-staple",
    ):
        from tests.factories import make_user

        user = await make_user(
            db_session_for_api,
            email=email,
            roles=roles,
            password=password,
        )
        async with api_client_factory() as client:
            session = await login(client, email=user.email, password=password)
            yield client, user, session

    return _as_user


async def login(
    client: AsyncClient,
    *,
    email: str,
    password: str,
) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    return {"csrf_token": payload["csrf_token"], "cookies": client.cookies}
