"""Database URL normalization for async SQLAlchemy and Alembic."""

from urllib.parse import urlsplit, urlunsplit


def to_async_sqlalchemy_url(database_url: str) -> str:
    """Return a URL SQLAlchemy's async engine accepts."""
    if database_url.startswith("postgresql+asyncpg://"):
        return database_url
    if database_url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + database_url.removeprefix("postgresql://")
    if database_url.startswith("postgres://"):
        return "postgresql+asyncpg://" + database_url.removeprefix("postgres://")
    return database_url


def to_alembic_url(database_url: str) -> str:
    """Alembic runs migrations with the async driver in this project."""
    return to_async_sqlalchemy_url(database_url)


def test_database_url(database_url: str) -> str:
    """Derive an isolated database name for pytest from the configured URL."""
    async_url = to_async_sqlalchemy_url(database_url)
    parsed = urlsplit(async_url)
    path = parsed.path.rstrip("/")
    if path.endswith("_test"):
        return async_url
    database_name = path.lstrip("/") or "tvn"
    test_path = f"/{database_name}_test"
    return urlunsplit((parsed.scheme, parsed.netloc, test_path, parsed.query, parsed.fragment))
