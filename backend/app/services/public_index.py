"""Maintain the public_articles projection from live publication snapshots."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.search_text import build_search_fields
from app.db.enums import ArticleVersionKind, LanguageEditorialStatus
from app.models.public_index import PublicArticle
from app.models.publication import ArticleVersion, FactCheckContent
from app.models.topics import Topic
from app.schemas.factchecks import PublicArticleSnapshot


async def topic_slugs_for_fact_check(
    session: AsyncSession,
    *,
    fact_check_id: uuid.UUID,
) -> list[str]:
    from app.models.topics import FactCheckTopic

    rows = (
        await session.execute(
            select(Topic.slug)
            .join(FactCheckTopic, FactCheckTopic.topic_id == Topic.id)
            .where(FactCheckTopic.fact_check_id == fact_check_id)
            .order_by(Topic.position.asc(), Topic.slug.asc())
        )
    ).scalars().all()
    return list(rows)


async def mark_topics_slug_immutable(session: AsyncSession, *, slugs: list[str]) -> None:
    if not slugs:
        return
    topics = (
        await session.execute(
            select(Topic).where(Topic.slug.in_(slugs), Topic.slug_immutable.is_(False))
        )
    ).scalars().all()
    for topic in topics:
        topic.slug_immutable = True


async def upsert_public_article(
    session: AsyncSession,
    *,
    content: FactCheckContent,
    version: ArticleVersion,
    snapshot: PublicArticleSnapshot,
) -> None:
    from app.services.publication import verify_snapshot_checksum

    if not verify_snapshot_checksum(version):
        raise ValueError("Refusing to index article version with invalid checksum")

    search_text, search_tokens = build_search_fields(
        title=snapshot.title,
        summary=snapshot.summary,
        claim_text=snapshot.claim_text,
        context_text=snapshot.context_text,
        analysis_markdown=snapshot.analysis_markdown,
        verdict_explanation=snapshot.verdict_explanation,
    )
    is_withdrawn = snapshot.kind == ArticleVersionKind.WITHDRAWAL or bool(
        snapshot.withdrawal_notice
    )

    existing = await session.get(PublicArticle, content.id)
    first_published_at = existing.first_published_at if existing else version.published_at

    row = {
        "content_id": content.id,
        "fact_check_id": content.fact_check_id,
        "language": content.language,
        "slug": snapshot.public_slug,
        "live_version_id": version.id,
        "version_number": version.version_number,
        "title": snapshot.title,
        "summary": snapshot.summary,
        "verdict": snapshot.verdict,
        "topics": snapshot.topics,
        "first_published_at": first_published_at,
        "last_published_at": version.published_at,
        "is_withdrawn": is_withdrawn,
        "search_text": search_text,
        "search_tokens": search_tokens,
    }
    insert_stmt = insert(PublicArticle).values(**row)
    upsert = insert_stmt.on_conflict_do_update(
        index_elements=[PublicArticle.content_id],
        set_={
            "fact_check_id": insert_stmt.excluded.fact_check_id,
            "language": insert_stmt.excluded.language,
            "slug": insert_stmt.excluded.slug,
            "live_version_id": insert_stmt.excluded.live_version_id,
            "version_number": insert_stmt.excluded.version_number,
            "title": insert_stmt.excluded.title,
            "summary": insert_stmt.excluded.summary,
            "verdict": insert_stmt.excluded.verdict,
            "topics": insert_stmt.excluded.topics,
            "last_published_at": insert_stmt.excluded.last_published_at,
            "is_withdrawn": insert_stmt.excluded.is_withdrawn,
            "search_text": insert_stmt.excluded.search_text,
            "search_tokens": insert_stmt.excluded.search_tokens,
        },
    )
    await session.execute(upsert)
    await mark_topics_slug_immutable(session, slugs=snapshot.topics)


async def rebuild_public_index(session: AsyncSession) -> int:
    """Rebuild all public_articles rows from live snapshots. Returns row count."""
    await session.execute(PublicArticle.__table__.delete())
    contents = (
        await session.execute(
            select(FactCheckContent)
            .where(
                FactCheckContent.live_version_id.is_not(None),
                FactCheckContent.editorial_status.in_(
                    (LanguageEditorialStatus.PUBLISHED, LanguageEditorialStatus.WITHDRAWN)
                ),
            )
            .order_by(FactCheckContent.id)
        )
    ).scalars().all()
    count = 0
    for content in contents:
        version = await session.get(ArticleVersion, content.live_version_id)
        if version is None:
            continue
        snapshot = PublicArticleSnapshot.model_validate(version.snapshot)
        await upsert_public_article(session, content=content, version=version, snapshot=snapshot)
        count += 1
    return count


async def projection_matches_snapshots(session: AsyncSession) -> bool:
    """Return True when every indexed row matches its live snapshot."""
    rows = (await session.execute(select(PublicArticle))).scalars().all()
    for row in rows:
        version = await session.get(ArticleVersion, row.live_version_id)
        if version is None:
            return False
        snapshot = PublicArticleSnapshot.model_validate(version.snapshot)
        if snapshot.public_slug != row.slug or snapshot.topics != row.topics:
            return False
        if row.version_number != version.version_number:
            return False
    indexed = len(rows)
    expected = await session.scalar(
        select(func.count())
        .select_from(FactCheckContent)
        .where(
            FactCheckContent.live_version_id.is_not(None),
            FactCheckContent.editorial_status.in_(
                (LanguageEditorialStatus.PUBLISHED, LanguageEditorialStatus.WITHDRAWN)
            ),
        )
    )
    return indexed == int(expected or 0)
