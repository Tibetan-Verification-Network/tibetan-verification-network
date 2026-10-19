"""Alembic migration safety checks."""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from tests.db_helpers import (
    downgrade_base,
    ensure_database,
    migration_database_url,
    postgres_is_available,
    upgrade_head,
)

EXPECTED_TABLES = frozenset(
    {
        "access_grants",
        "alembic_version",
        "archive_documents",
        "article_versions",
        "audit_events",
        "auth_sessions",
        "claims",
        "evidence_items",
        "fact_check_contents",
        "fact_checks",
        "investigations",
        "research_runs",
        "reviews",
        "roles",
        "sources",
        "staff_invite_roles",
        "staff_invites",
        "submission_contacts",
        "submissions",
        "user_roles",
        "users",
    }
)


async def test_upgrade_head_on_empty_database_creates_core_tables() -> None:
    database_url = migration_database_url()
    if not await postgres_is_available(database_url):
        pytest.skip("PostgreSQL is not available for migration tests")
    await ensure_database(database_url)
    downgrade_base(database_url)
    upgrade_head(database_url)

    engine = create_async_engine(database_url, pool_pre_ping=True)
    try:
        async with engine.connect() as connection:
            result = await connection.execute(
                text(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    """
                )
            )
            tables = {row[0] for row in result}
    finally:
        await engine.dispose()

    assert EXPECTED_TABLES.issubset(tables)


async def test_role_seed_and_user_role_uniqueness_after_migration(test_engine: AsyncEngine) -> None:
    async with test_engine.connect() as connection:
        role_count = await connection.scalar(text("SELECT COUNT(*) FROM roles"))
        duplicate_roles = await connection.scalar(
            text(
                """
                SELECT COUNT(*) FROM (
                    SELECT user_id, role_id, COUNT(*) AS total
                    FROM user_roles
                    GROUP BY user_id, role_id
                    HAVING COUNT(*) > 1
                ) duplicates
                """
            )
        )
    assert role_count == 4
    assert duplicate_roles == 0
