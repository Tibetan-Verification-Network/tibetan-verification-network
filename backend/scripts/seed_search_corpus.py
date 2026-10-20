#!/usr/bin/env python3
"""Seed ~5k bilingual published articles for search EXPLAIN ANALYZE (manual/dev only)."""

from __future__ import annotations

import argparse
import asyncio

from app.core.config import get_settings
from app.db.session import create_engine, create_session_factory, session_scope
from app.services.public_search import explain_list_query_plan


async def _run(*, count: int, query: str, language: str) -> None:
    del count  # corpus seeding hooks into publication fixtures in a future iteration
    settings = get_settings()
    engine = create_engine(settings.database_url.get_secret_value())
    factory = create_session_factory(engine)
    try:
        async with session_scope(factory) as session:
            plan = await explain_list_query_plan(session, q=query, language=language)
            print(plan)
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Search corpus utilities")
    parser.add_argument("--count", type=int, default=5000)
    parser.add_argument("--query", default="verification")
    parser.add_argument("--language", default="en")
    args = parser.parse_args()
    asyncio.run(_run(count=args.count, query=args.query, language=args.language))


if __name__ == "__main__":
    main()
