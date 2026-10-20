"""Public topic listings with published counts."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import LanguageCode
from app.models.public_index import PublicArticle
from app.models.topics import Topic
from app.schemas.public import (
    PublicFactCheckCard,
    PublicTopicDetailResponse,
    PublicTopicListResponse,
)


async def _published_counts(
    session: AsyncSession,
    *,
    slug: str,
) -> tuple[int, int]:
    en = await session.scalar(
        select(func.count())
        .select_from(PublicArticle)
        .where(
            PublicArticle.topics.contains([slug]),
            PublicArticle.language == LanguageCode.EN,
            PublicArticle.is_withdrawn.is_(False),
        )
    )
    bo = await session.scalar(
        select(func.count())
        .select_from(PublicArticle)
        .where(
            PublicArticle.topics.contains([slug]),
            PublicArticle.language == LanguageCode.BO,
            PublicArticle.is_withdrawn.is_(False),
        )
    )
    return int(en or 0), int(bo or 0)


async def list_public_topics(session: AsyncSession) -> PublicTopicListResponse:
    topics = (
        await session.execute(
            select(Topic)
            .where(Topic.is_active.is_(True))
            .order_by(Topic.position.asc(), Topic.slug.asc())
        )
    ).scalars().all()
    items = []
    for topic in topics:
        en_count, bo_count = await _published_counts(session, slug=topic.slug)
        items.append(
            {
                "slug": topic.slug,
                "name_bo": topic.name_bo,
                "name_en": topic.name_en,
                "description_bo": topic.description_bo,
                "description_en": topic.description_en,
                "published_count_en": en_count,
                "published_count_bo": bo_count,
            }
        )
    from app.schemas.public import PublicTopicSummary

    return PublicTopicListResponse(
        items=[PublicTopicSummary.model_validate(item) for item in items],
    )


async def get_public_topic(session: AsyncSession, *, slug: str) -> PublicTopicDetailResponse:
    topic = await session.scalar(select(Topic).where(Topic.slug == slug, Topic.is_active.is_(True)))
    if topic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    en_count, bo_count = await _published_counts(session, slug=topic.slug)
    recent_rows = (
        await session.execute(
            select(PublicArticle)
            .where(
                PublicArticle.topics.contains([topic.slug]),
                PublicArticle.is_withdrawn.is_(False),
            )
            .order_by(PublicArticle.last_published_at.desc())
            .limit(10)
        )
    ).scalars().all()
    recent = [
        PublicFactCheckCard(
            slug=row.slug,
            language=row.language.value,
            title=row.title,
            summary=row.summary,
            verdict=row.verdict,
            topics=list(row.topics),
            first_published_at=row.first_published_at,
            last_published_at=row.last_published_at,
        )
        for row in recent_rows
    ]
    return PublicTopicDetailResponse(
        slug=topic.slug,
        name_bo=topic.name_bo,
        name_en=topic.name_en,
        description_bo=topic.description_bo,
        description_en=topic.description_en,
        published_count_en=en_count,
        published_count_bo=bo_count,
        recent=recent,
    )
