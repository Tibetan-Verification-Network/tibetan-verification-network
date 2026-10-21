"""Public fact-check search and listing over the public_articles projection."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Select, or_, select, text, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.search_text import latin_tokens, normalize_unicode, tibetan_syllable_tokens
from app.db.enums import LanguageCode, PublicVerdict
from app.models.public_index import PublicArticle
from app.schemas.public import PublicFactCheckCard, PublicFactCheckListResponse
from app.services.intake import decode_keyset_cursor, encode_keyset_cursor

MAX_QUERY_LENGTH = 200
DEFAULT_LIMIT = 20
MAX_LIMIT = 50


def _parse_language(raw: str | None) -> LanguageCode | None:
    if raw is None or raw == "":
        return None
    return LanguageCode(raw)


def _parse_verdict(raw: str | None) -> PublicVerdict | None:
    if raw is None or raw == "":
        return None
    return PublicVerdict(raw)


def _search_filters(query: str) -> tuple[list[str], list[str]]:
    normalized = normalize_unicode(query.strip())
    tibetan = tibetan_syllable_tokens(normalized)
    latin = latin_tokens(normalized)
    return tibetan, latin


def _apply_search(
    stmt: Select[Any],
    *,
    query: str,
) -> Select[Any]:
    tibetan, latin = _search_filters(query)
    clauses = []
    if tibetan:
        clauses.append(PublicArticle.search_tokens.contains(tibetan))
    for token in latin:
        pattern = f"%{token}%"
        clauses.append(PublicArticle.search_text.ilike(pattern))
    if not clauses:
        return stmt
    return stmt.where(or_(*clauses))


async def list_public_factchecks(
    session: AsyncSession,
    *,
    q: str | None,
    language: str | None,
    verdict: str | None,
    topic: str | None,
    published_from: datetime | None,
    published_to: datetime | None,
    cursor: str | None,
    limit: int,
) -> PublicFactCheckListResponse:
    capped_limit = min(max(limit, 1), MAX_LIMIT)
    lang = _parse_language(language)
    verdict_filter = _parse_verdict(verdict)

    stmt = select(PublicArticle).where(PublicArticle.is_withdrawn.is_(False))
    if lang is not None:
        stmt = stmt.where(PublicArticle.language == lang)
    if verdict_filter is not None:
        stmt = stmt.where(PublicArticle.verdict == verdict_filter)
    if topic:
        stmt = stmt.where(PublicArticle.topics.contains([topic]))
    if published_from is not None:
        stmt = stmt.where(PublicArticle.last_published_at >= published_from)
    if published_to is not None:
        stmt = stmt.where(PublicArticle.last_published_at <= published_to)
    if q:
        trimmed = q.strip()
        if len(trimmed) > MAX_QUERY_LENGTH:
            trimmed = trimmed[:MAX_QUERY_LENGTH]
        if trimmed:
            stmt = _apply_search(stmt, query=trimmed)

    stmt = stmt.order_by(
        PublicArticle.last_published_at.desc(),
        PublicArticle.content_id.desc(),
    )
    if cursor is not None:
        cursor_at, cursor_id = decode_keyset_cursor(cursor)
        stmt = stmt.where(
            tuple_(PublicArticle.last_published_at, PublicArticle.content_id)
            < tuple_(cursor_at, cursor_id)
        )

    rows = (await session.execute(stmt.limit(capped_limit + 1))).scalars().all()
    has_more = len(rows) > capped_limit
    items = rows[:capped_limit]
    cards = [
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
        for row in items
    ]
    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = encode_keyset_cursor(last.last_published_at, last.content_id)
    return PublicFactCheckListResponse(items=cards, next_cursor=next_cursor)


async def explain_list_query_plan(session: AsyncSession, *, q: str, language: str) -> str:
    """Run EXPLAIN ANALYZE for search tuning (used by docs/search.md)."""
    stmt = select(PublicArticle).where(
        PublicArticle.is_withdrawn.is_(False),
        PublicArticle.language == LanguageCode(language),
    )
    stmt = _apply_search(stmt, query=q)
    compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
    result = await session.execute(text(f"EXPLAIN ANALYZE {compiled}"))
    return "\n".join(row[0] for row in result.all())
