"""Anonymous public read API for published fact-checks."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.schemas.factchecks import PublicArticleSnapshot
from app.schemas.public import PublicFactCheckDetailResponse, PublicFactCheckListResponse
from app.services.public_read import (
    etag_for_checksum,
    get_public_factcheck,
    get_public_factcheck_version,
)
from app.services.public_search import DEFAULT_LIMIT, MAX_LIMIT, list_public_factchecks

router = APIRouter(tags=["public"])

PUBLIC_CACHE = "public, max-age=60, stale-while-revalidate=300"


def _cache_headers(response: Response, *, etag: str | None = None) -> None:
    response.headers["Cache-Control"] = PUBLIC_CACHE
    if etag is not None:
        response.headers["ETag"] = etag


@router.get("/factchecks", response_model=PublicFactCheckListResponse)
async def public_factcheck_list(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    q: str | None = None,
    lang: str | None = None,
    verdict: str | None = None,
    topic: str | None = None,
    from_date: Annotated[datetime | None, Query(alias="from")] = None,
    to_date: Annotated[datetime | None, Query(alias="to")] = None,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
) -> PublicFactCheckListResponse:
    _cache_headers(response)
    return await list_public_factchecks(
        db,
        q=q,
        language=lang,
        verdict=verdict,
        topic=topic,
        published_from=from_date,
        published_to=to_date,
        cursor=cursor,
        limit=limit,
    )


@router.get("/factchecks/{slug}", response_model=PublicFactCheckDetailResponse)
async def public_factcheck_detail(
    slug: str,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    lang: str = Query(min_length=2, max_length=2),
) -> PublicFactCheckDetailResponse:
    detail = await get_public_factcheck(db, slug=slug, language=lang)
    _cache_headers(response, etag=etag_for_checksum(detail.checksum))
    return detail


@router.get("/factchecks/{slug}/versions/{version_number}", response_model=PublicArticleSnapshot)
async def public_factcheck_version(
    slug: str,
    version_number: int,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    lang: str = Query(min_length=2, max_length=2),
) -> PublicArticleSnapshot:
    snapshot = await get_public_factcheck_version(
        db,
        slug=slug,
        language=lang,
        version_number=version_number,
    )
    _cache_headers(response)
    return snapshot
