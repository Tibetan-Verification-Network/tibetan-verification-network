"""Hermetic defaults so importing the app does not read a developer .env file."""

import os
from collections.abc import AsyncIterator, Iterator

import pytest
from httpx import ASGITransport, AsyncClient

os.environ["TVN_ENV_FILE"] = ""
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql://tvn:tvn_local_dev@127.0.0.1:5432/tvn",
)
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")
os.environ.setdefault("LOG_LEVEL", "warning")

pytest_plugins = ["tests.conftest_db", "tests.auth_helpers"]


@pytest.fixture(autouse=True)
def clear_settings_cache() -> Iterator[None]:
    from app.core.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    from app.main import create_app
    from tests.helpers import settings_for_tests

    application = create_app(settings_for_tests())
    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://testserver") as http:
        yield http
