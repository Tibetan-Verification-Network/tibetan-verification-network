"""Rebuild the public_articles projection from live snapshots."""

from __future__ import annotations

import asyncio
import sys

from app.core.config import get_settings
from app.db.session import create_engine, create_session_factory, session_scope
from app.services.public_index import projection_matches_snapshots, rebuild_public_index


async def _run() -> int:
    settings = get_settings()
    engine = create_engine(settings.database_url.get_secret_value())
    factory = create_session_factory(engine)
    try:
        async with session_scope(factory) as session:
            count = await rebuild_public_index(session)
            if not await projection_matches_snapshots(session):
                print("Projection verification failed.", file=sys.stderr)
                return 1
            await session.commit()
    finally:
        await engine.dispose()
    print(f"Rebuilt {count} public index rows.")
    return 0


def main() -> None:
    raise SystemExit(asyncio.run(_run()))


if __name__ == "__main__":
    main()
