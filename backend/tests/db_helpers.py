"""Database helpers for PostgreSQL-backed tests."""

from __future__ import annotations

import os
import re
from concurrent import futures
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import asyncpg
from alembic.config import Config
from sqlalchemy.ext.asyncio import AsyncEngine

from alembic import command
from app.db.session import create_engine
from app.db.url import test_database_url, to_async_sqlalchemy_url


def configured_database_url() -> str:
    return os.environ.get(
        "DATABASE_URL",
        "postgresql://tvn:tvn_local_dev@127.0.0.1:5432/tvn",
    )


def resolve_test_database_url() -> str:
    override = os.environ.get("TVN_TEST_DATABASE_URL")
    if override:
        return to_async_sqlalchemy_url(override)
    return test_database_url(configured_database_url())


def migration_database_url() -> str:
    base = resolve_test_database_url()
    parsed = urlsplit(base)
    path = parsed.path.rstrip("/")
    if path.endswith("_migrate_test"):
        return base
    database_name = path.lstrip("/") or "tvn_test"
    migrate_path = f"/{database_name}_migrate_test"
    return urlunsplit((parsed.scheme, parsed.netloc, migrate_path, parsed.query, parsed.fragment))


def alembic_config(database_url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", to_async_sqlalchemy_url(database_url))
    os.environ["DATABASE_URL"] = database_url.replace("postgresql+asyncpg://", "postgresql://")
    os.environ["TVN_ENV_FILE"] = ""
    return config


def upgrade_head(database_url: str) -> None:
    _run_alembic_command("upgrade", database_url, "head")


def downgrade_base(database_url: str) -> None:
    _run_alembic_command("downgrade", database_url, "base")


def _run_alembic_command(action: str, database_url: str, revision: str) -> None:
    """Run Alembic in a worker thread so pytest's asyncio loop stays usable."""
    config = alembic_config(database_url)

    def invoke() -> None:
        if action == "upgrade":
            command.upgrade(config, revision)
        else:
            command.downgrade(config, revision)

    with futures.ThreadPoolExecutor(max_workers=1) as executor:
        executor.submit(invoke).result()


async def postgres_is_available(database_url: str) -> bool:
    admin_dsn = _admin_dsn(database_url)
    try:
        connection = await asyncpg.connect(admin_dsn, timeout=2)
    except Exception:
        return False
    try:
        await connection.fetchval("SELECT 1")
    except Exception:
        return False
    finally:
        await connection.close()
    return True


_SAFE_DATABASE_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


async def recreate_database(database_url: str) -> None:
    """Drop and recreate a database so a smoke test can start from empty storage."""
    parsed = urlsplit(to_async_sqlalchemy_url(database_url))
    database_name = parsed.path.lstrip("/")
    if _SAFE_DATABASE_NAME.fullmatch(database_name) is None:
        raise ValueError("database name must be a plain identifier")
    connection = await asyncpg.connect(_admin_dsn(database_url), timeout=5)
    try:
        await connection.execute(
            """
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = $1 AND pid <> pg_backend_pid()
            """,
            database_name,
        )
        await connection.execute(f'DROP DATABASE IF EXISTS "{database_name}"')
        await connection.execute(f'CREATE DATABASE "{database_name}"')
    finally:
        await connection.close()


async def ensure_database(database_url: str) -> None:
    parsed = urlsplit(to_async_sqlalchemy_url(database_url))
    database_name = parsed.path.lstrip("/")
    if not database_name:
        raise ValueError("database URL must include a database name")
    connection = await asyncpg.connect(_admin_dsn(database_url), timeout=5)
    try:
        exists = await connection.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            database_name,
        )
        if exists is None:
            await connection.execute(f'CREATE DATABASE "{database_name}"')
    finally:
        await connection.close()


async def prepare_engine(database_url: str) -> AsyncEngine:
    await ensure_database(database_url)
    upgrade_head(database_url)
    return create_engine(database_url)


def _admin_dsn(database_url: str) -> str:
    parsed = urlsplit(to_async_sqlalchemy_url(database_url))
    admin_path = "/postgres"
    return urlunsplit(
        (
            "postgresql",
            parsed.netloc,
            admin_path,
            parsed.query,
            parsed.fragment,
        )
    )
