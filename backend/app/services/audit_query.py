"""Scoped audit history for editorial staff."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.policy import Action, can
from app.models.audit import AuditEvent
from app.models.identity import User
from app.models.publication import FactCheck, FactCheckContent
from app.models.research import Investigation
from app.schemas.audit import AuditEventListResponse, AuditEventResponse
from app.services.intake import decode_keyset_cursor, encode_keyset_cursor


async def _assert_subject_visible(
    session: AsyncSession,
    *,
    user: User,
    subject_type: str,
    subject_id: uuid.UUID,
) -> None:
    normalized = subject_type.strip().lower()
    if normalized == "fact_check":
        fact_check = await session.get(FactCheck, subject_id)
        if fact_check is None or not can(user, Action.FACTCHECK_VIEW, fact_check):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        return
    if normalized == "fact_check_content":
        content = await session.scalar(
            select(FactCheckContent)
            .where(FactCheckContent.id == subject_id)
            .options(selectinload(FactCheckContent.fact_check))
        )
        if content is None or content.fact_check is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        if not can(user, Action.FACTCHECK_VIEW, content.fact_check):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        return
    if normalized == "investigation":
        investigation = await session.get(Investigation, subject_id)
        if investigation is None or not can(user, Action.INVESTIGATION_VIEW, investigation):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        return
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)


async def list_audit_events(
    session: AsyncSession,
    *,
    user: User,
    subject_type: str,
    subject_id: uuid.UUID,
    limit: int,
    cursor: str | None,
) -> AuditEventListResponse:
    await _assert_subject_visible(
        session,
        user=user,
        subject_type=subject_type,
        subject_id=subject_id,
    )

    stmt = (
        select(AuditEvent)
        .where(
            AuditEvent.subject_type == subject_type,
            AuditEvent.subject_id == subject_id,
        )
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
    )
    if cursor is not None:
        cursor_created_at, cursor_id = decode_keyset_cursor(cursor)
        stmt = stmt.where(
            tuple_(AuditEvent.created_at, AuditEvent.id) < tuple_(cursor_created_at, cursor_id)
        )

    rows = (await session.execute(stmt.limit(limit + 1))).scalars().all()
    page = rows[:limit]
    items = [
        AuditEventResponse(
            id=row.id,
            event_type=row.event_type,
            actor_user_id=row.actor_user_id,
            subject_type=row.subject_type,
            subject_id=row.subject_id,
            payload=row.payload,
            created_at=row.created_at,
        )
        for row in page
    ]
    next_cursor = None
    if len(rows) > limit and page:
        last = page[-1]
        next_cursor = encode_keyset_cursor(last.created_at, last.id)
    return AuditEventListResponse(items=items, next_cursor=next_cursor)
