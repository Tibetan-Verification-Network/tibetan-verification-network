"""Post-restore verification: checksums, public index rebuild, projection match."""

from __future__ import annotations

import asyncio
import sys
import time

from sqlalchemy import func, select

from app.core.config import get_settings
from app.db.session import create_engine, create_session_factory, session_scope
from app.models.public_index import PublicArticle
from app.models.publication import ArticleVersion
from app.services.public_index import projection_matches_snapshots, rebuild_public_index
from app.services.publication import verify_snapshot_checksum


async def _run() -> int:
    started = time.monotonic()
    settings = get_settings()
    engine = create_engine(settings.database_url.get_secret_value())
    factory = create_session_factory(engine)
    try:
        async with session_scope(factory) as session:
            versions = (await session.execute(select(ArticleVersion))).scalars().all()
            bad = [row.id for row in versions if not verify_snapshot_checksum(row)]
            if bad:
                print(f"Checksum failures: {len(bad)} article version(s).", file=sys.stderr)
                return 1

            before = await session.scalar(select(func.count()).select_from(PublicArticle))
            count = await rebuild_public_index(session)
            after = await session.scalar(select(func.count()).select_from(PublicArticle))
            if not await projection_matches_snapshots(session):
                print("Projection verification failed after rebuild.", file=sys.stderr)
                return 1
            await session.commit()

        elapsed = time.monotonic() - started
        print(
            f"Restore drill OK: {len(versions)} version(s), "
            f"index {before} -> {after} rows ({count} rebuilt), {elapsed:.1f}s."
        )
        return 0
    finally:
        await engine.dispose()


def main() -> None:
    raise SystemExit(asyncio.run(_run()))


if __name__ == "__main__":
    main()
