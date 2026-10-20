"""Anonymous public topic listings."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.schemas.public import PublicTopicDetailResponse, PublicTopicListResponse
from app.services.public_topics import get_public_topic, list_public_topics

router = APIRouter(tags=["public"])

PUBLIC_CACHE = "public, max-age=60, stale-while-revalidate=300"


@router.get("/topics", response_model=PublicTopicListResponse)
async def public_topics_list(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> PublicTopicListResponse:
    response.headers["Cache-Control"] = PUBLIC_CACHE
    return await list_public_topics(db)


@router.get("/topics/{slug}", response_model=PublicTopicDetailResponse)
async def public_topic_detail(
    slug: str,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> PublicTopicDetailResponse:
    response.headers["Cache-Control"] = PUBLIC_CACHE
    return await get_public_topic(db, slug=slug)
