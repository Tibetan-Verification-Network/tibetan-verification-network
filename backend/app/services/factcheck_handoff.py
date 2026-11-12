"""Revision-scoped editor and approver designation for fact-check languages."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import ReviewDecision
from app.models.publication import FactCheckContent, FactCheckContentRevision, Review


async def _revision_for_number(
    session: AsyncSession,
    *,
    content_id: uuid.UUID,
    revision_number: int,
) -> FactCheckContentRevision | None:
    if revision_number <= 0:
        return None
    return await session.scalar(
        select(FactCheckContentRevision).where(
            FactCheckContentRevision.content_id == content_id,
            FactCheckContentRevision.revision_number == revision_number,
        )
    )


async def active_mark_ready_review(
    session: AsyncSession,
    *,
    content_id: uuid.UUID,
    revision_id: uuid.UUID | None,
) -> Review | None:
    if revision_id is None:
        return None
    return await session.scalar(
        select(Review).where(
            Review.fact_check_content_id == content_id,
            Review.revision_id == revision_id,
            Review.decision == ReviewDecision.MARK_READY,
            Review.invalidated_at.is_(None),
        )
    )


async def handoff_ids_for_content(
    session: AsyncSession,
    *,
    content: FactCheckContent,
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    revision = await _revision_for_number(
        session,
        content_id=content.id,
        revision_number=content.current_revision_number,
    )
    if revision is None:
        return None, None
    review = await active_mark_ready_review(
        session,
        content_id=content.id,
        revision_id=revision.id,
    )
    if review is None:
        return None, None
    return review.reviewer_id, review.selected_approver_id
