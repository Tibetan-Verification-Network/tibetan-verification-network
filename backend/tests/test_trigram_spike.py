"""Document Tibetan trigram behavior when Postgres is available."""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.usefixtures("db_session_for_api")
async def test_show_trgm_handles_tibetan_and_latin(db_session_for_api: AsyncSession) -> None:
    tibetan = (
        await db_session_for_api.execute(text("SELECT show_trgm('བོད་ཡིག')"))
    ).scalar_one()
    latin = (
        await db_session_for_api.execute(text("SELECT show_trgm('verification')"))
    ).scalar_one()
    assert isinstance(tibetan, list)
    assert isinstance(latin, list)
    assert len(latin) > 0
