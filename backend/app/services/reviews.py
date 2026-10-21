"""Review workflow, readiness, and independent approval."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.policy import scope_factchecks
from app.db.enums import LanguageCode as DbLanguageCode
from app.db.enums import LanguageEditorialStatus, ReviewDecision
from app.models.identity import User
from app.models.publication import (
    FactCheck,
    FactCheckContent,
    FactCheckContentRevision,
    FactCheckContentSource,
    Review,
)
from app.schemas.common import LanguageCode
from app.schemas.factchecks import (
    ApprovalQueueItemResponse,
    ApprovalQueueResponse,
    ApproveRequest,
    DraftResponse,
    ReadinessResponse,
    ReasonRequest,
    ReviewCommentRequest,
    ReviewListResponse,
    ReviewResponse,
    SubmitForReviewResponse,
)
from app.services.audit import AuditEventType, record_audit_event
from app.services.drafts import _draft_response, _language_code, _load_content_for_language
from app.services.intake import decode_keyset_cursor, encode_keyset_cursor
from app.workflow.engine import TransitionSubject, apply_transition
from app.workflow.exceptions import InvalidTransitionError, TransitionBlockedError
from app.workflow.guards import (
    assert_not_author,
    assert_not_ready_marking_editor,
    authors_of,
)
from app.workflow.http import http_conflict_from_guard, http_conflict_from_transition
from app.workflow.readiness import check_readiness


def _readiness_http_exception(issues: list[str]) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "readiness_failed",
            "message": "Publication readiness checks failed",
            "issues": issues,
        },
    )


def _require_reason(body: ReasonRequest) -> str:
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "reason_required", "message": "reason is required"},
        )
    return reason


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


async def _active_mark_ready_reviewer_id(
    session: AsyncSession,
    *,
    content_id: uuid.UUID,
    revision_id: uuid.UUID | None,
) -> uuid.UUID | None:
    if revision_id is None:
        return None
    return await session.scalar(
        select(Review.reviewer_id).where(
            Review.fact_check_content_id == content_id,
            Review.revision_id == revision_id,
            Review.decision == ReviewDecision.MARK_READY,
            Review.invalidated_at.is_(None),
        )
    )


async def _load_locked_content(
    session: AsyncSession,
    *,
    fact_check_id: uuid.UUID,
    language: str,
) -> FactCheckContent:
    result = await session.execute(
        select(FactCheckContent)
        .where(
            FactCheckContent.fact_check_id == fact_check_id,
            FactCheckContent.language == _language_code(language),
        )
        .options(
            selectinload(FactCheckContent.source_links).selectinload(
                FactCheckContentSource.source
            ),
            selectinload(FactCheckContent.fact_check).selectinload(FactCheck.investigation),
            selectinload(FactCheckContent.fact_check).selectinload(FactCheck.contents),
            selectinload(FactCheckContent.live_version),
        )
        .with_for_update()
    )
    content = result.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return content


def _review_response(review: Review) -> ReviewResponse:
    return ReviewResponse(
        id=review.id,
        fact_check_content_id=review.fact_check_content_id,
        reviewer_id=review.reviewer_id,
        decision=review.decision,
        comments=review.comments,
        revision_id=review.revision_id,
        created_at=review.created_at,
        invalidated_at=review.invalidated_at,
    )


async def _invalidate_active_decisions(
    session: AsyncSession,
    *,
    content: FactCheckContent,
    reason: str,
    actor: User,
) -> None:
    now = datetime.now(UTC)
    rows = (
        await session.execute(
            select(Review).where(
                Review.fact_check_content_id == content.id,
                Review.decision.in_((ReviewDecision.MARK_READY, ReviewDecision.APPROVE)),
                Review.invalidated_at.is_(None),
            )
        )
    ).scalars().all()
    for review in rows:
        review.invalidated_at = now
        review.invalidated_reason = reason
        await record_audit_event(
            session,
            event_type=AuditEventType.REVIEW_INVALIDATED,
            actor_user_id=actor.id,
            subject_type="review",
            subject_id=review.id,
            payload={
                "fact_check_content_id": str(content.id),
                "decision": review.decision.value,
                "reason": reason,
            },
        )


async def get_language_readiness(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    language: DbLanguageCode,
) -> ReadinessResponse:
    content = await _load_content_for_language(
        session,
        fact_check_id=fact_check.id,
        language=language,
    )
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    investigation = content.fact_check.investigation
    if investigation is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)
    issues = await check_readiness(
        session,
        fact_check=content.fact_check,
        content=content,
        investigation=investigation,
    )
    return ReadinessResponse(issues=issues)


async def submit_for_review(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    language: str,
    actor: User,
) -> SubmitForReviewResponse:
    content = await _load_locked_content(session, fact_check_id=fact_check.id, language=language)
    investigation = content.fact_check.investigation
    if investigation is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    issues = await check_readiness(
        session,
        fact_check=content.fact_check,
        content=content,
        investigation=investigation,
    )

    try:
        await apply_transition(
            session,
            subject=TransitionSubject.LANGUAGE_CONTENT,
            entity_id=content.id,
            to_status=LanguageEditorialStatus.IN_REVIEW,
            actor=actor,
        )
    except InvalidTransitionError as exc:
        raise http_conflict_from_transition(exc) from exc
    except TransitionBlockedError as exc:
        raise http_conflict_from_guard(exc) from exc

    await record_audit_event(
        session,
        event_type=AuditEventType.DRAFT_SUBMITTED_FOR_REVIEW,
        actor_user_id=actor.id,
        subject_type="fact_check_content",
        subject_id=content.id,
        payload={
            "fact_check_id": str(fact_check.id),
            "language": content.language.value,
            "readiness_warnings": issues,
        },
    )
    await session.flush()
    await session.refresh(content, attribute_names=["editorial_status", "source_links"])
    return SubmitForReviewResponse(
        editorial_status=content.editorial_status,
        readiness_warnings=issues,
    )


async def list_reviews(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    language: str,
) -> ReviewListResponse:
    """Internal review thread for one language, oldest first. Never part of a public snapshot."""
    content = await _load_content_for_language(
        session,
        fact_check_id=fact_check.id,
        language=_language_code(language),
    )
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    rows = (
        (
            await session.execute(
                select(Review)
                .where(Review.fact_check_content_id == content.id)
                .order_by(Review.created_at.asc(), Review.id.asc())
            )
        )
        .scalars()
        .all()
    )
    return ReviewListResponse(items=[_review_response(row) for row in rows])


async def add_review_comment(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    language: str,
    actor: User,
    body: ReviewCommentRequest,
) -> ReviewResponse:
    content = await _load_locked_content(session, fact_check_id=fact_check.id, language=language)
    revision = await _revision_for_number(
        session,
        content_id=content.id,
        revision_number=content.current_revision_number,
    )
    review = Review(
        fact_check_content_id=content.id,
        reviewer_id=actor.id,
        decision=ReviewDecision.COMMENT,
        comments=body.comments,
        revision_id=revision.id if revision else None,
    )
    session.add(review)
    await session.flush()
    await record_audit_event(
        session,
        event_type=AuditEventType.REVIEW_COMMENTED,
        actor_user_id=actor.id,
        subject_type="fact_check_content",
        subject_id=content.id,
        payload={
            "review_id": str(review.id),
            "field_anchor": body.field_anchor,
            "language": content.language.value,
        },
    )
    return _review_response(review)


async def request_changes(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    language: str,
    actor: User,
    body: ReasonRequest,
) -> DraftResponse:
    reason = _require_reason(body)
    content = await _load_locked_content(session, fact_check_id=fact_check.id, language=language)
    from_status = content.editorial_status
    if from_status not in {
        LanguageEditorialStatus.IN_REVIEW,
        LanguageEditorialStatus.READY_FOR_APPROVAL,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "invalid_transition",
                "message": "Request changes is only allowed from in_review or ready_for_approval",
            },
        )

    author_ids = await authors_of(session, content)
    try:
        assert_not_author(actor, author_ids)
    except TransitionBlockedError as exc:
        raise http_conflict_from_guard(exc) from exc

    revision = await _revision_for_number(
        session,
        content_id=content.id,
        revision_number=content.current_revision_number,
    )
    try:
        await apply_transition(
            session,
            subject=TransitionSubject.LANGUAGE_CONTENT,
            entity_id=content.id,
            to_status=LanguageEditorialStatus.CHANGES_REQUESTED,
            actor=actor,
            reason=reason,
        )
    except InvalidTransitionError as exc:
        raise http_conflict_from_transition(exc) from exc
    except TransitionBlockedError as exc:
        raise http_conflict_from_guard(exc) from exc

    review = Review(
        fact_check_content_id=content.id,
        reviewer_id=actor.id,
        decision=ReviewDecision.REQUEST_CHANGES,
        comments=reason,
        revision_id=revision.id if revision else None,
    )
    session.add(review)
    await record_audit_event(
        session,
        event_type=AuditEventType.REVIEW_CHANGES_REQUESTED,
        actor_user_id=actor.id,
        subject_type="fact_check_content",
        subject_id=content.id,
        payload={"language": content.language.value, "reason": reason},
    )
    await session.flush()
    await session.refresh(content, attribute_names=["editorial_status", "source_links"])
    return _draft_response(content)


async def mark_ready(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    language: str,
    actor: User,
) -> DraftResponse:
    content = await _load_locked_content(session, fact_check_id=fact_check.id, language=language)
    investigation = content.fact_check.investigation
    if investigation is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    author_ids = await authors_of(session, content)
    try:
        assert_not_author(actor, author_ids)
    except TransitionBlockedError as exc:
        raise http_conflict_from_guard(exc) from exc

    issues = await check_readiness(
        session,
        fact_check=content.fact_check,
        content=content,
        investigation=investigation,
    )
    if issues:
        await record_audit_event(
            session,
            event_type=AuditEventType.READINESS_BLOCKED,
            actor_user_id=actor.id,
            subject_type="fact_check_content",
            subject_id=content.id,
            payload={"action": "mark_ready", "issues": issues},
        )
        raise _readiness_http_exception(issues)

    revision = await _revision_for_number(
        session,
        content_id=content.id,
        revision_number=content.current_revision_number,
    )
    if revision is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "no_revision", "message": "Save a draft revision before marking ready"},
        )

    try:
        await apply_transition(
            session,
            subject=TransitionSubject.LANGUAGE_CONTENT,
            entity_id=content.id,
            to_status=LanguageEditorialStatus.READY_FOR_APPROVAL,
            actor=actor,
        )
    except InvalidTransitionError as exc:
        raise http_conflict_from_transition(exc) from exc
    except TransitionBlockedError as exc:
        raise http_conflict_from_guard(exc) from exc

    review = Review(
        fact_check_content_id=content.id,
        reviewer_id=actor.id,
        decision=ReviewDecision.MARK_READY,
        revision_id=revision.id,
    )
    session.add(review)
    await record_audit_event(
        session,
        event_type=AuditEventType.REVIEW_MARKED_READY,
        actor_user_id=actor.id,
        subject_type="fact_check_content",
        subject_id=content.id,
        payload={
            "language": content.language.value,
            "revision_number": content.current_revision_number,
        },
    )
    await session.flush()
    await session.refresh(content, attribute_names=["editorial_status", "source_links"])
    return _draft_response(content)


async def approve_language(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    language: str,
    actor: User,
    body: ApproveRequest,
) -> DraftResponse:
    content = await _load_locked_content(session, fact_check_id=fact_check.id, language=language)
    investigation = content.fact_check.investigation
    if investigation is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    if body.expected_revision != content.current_revision_number:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "stale_revision",
                "message": "expected_revision does not match the current revision",
                "expected_revision": body.expected_revision,
                "current_revision_number": content.current_revision_number,
            },
        )

    author_ids = await authors_of(session, content)
    try:
        assert_not_author(actor, author_ids)
    except TransitionBlockedError as exc:
        raise http_conflict_from_guard(exc) from exc

    revision = await _revision_for_number(
        session,
        content_id=content.id,
        revision_number=content.current_revision_number,
    )
    if revision is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "no_revision", "message": "No revision exists to approve"},
        )

    ready_editor_id = await _active_mark_ready_reviewer_id(
        session,
        content_id=content.id,
        revision_id=revision.id,
    )
    try:
        assert_not_ready_marking_editor(actor, ready_marking_editor_id=ready_editor_id)
    except TransitionBlockedError as exc:
        raise http_conflict_from_guard(exc) from exc

    issues = await check_readiness(
        session,
        fact_check=content.fact_check,
        content=content,
        investigation=investigation,
    )
    if issues:
        await record_audit_event(
            session,
            event_type=AuditEventType.READINESS_BLOCKED,
            actor_user_id=actor.id,
            subject_type="fact_check_content",
            subject_id=content.id,
            payload={"action": "approve", "issues": issues},
        )
        raise _readiness_http_exception(issues)

    review = Review(
        fact_check_content_id=content.id,
        reviewer_id=actor.id,
        decision=ReviewDecision.APPROVE,
        revision_id=revision.id,
    )
    session.add(review)
    try:
        await apply_transition(
            session,
            subject=TransitionSubject.LANGUAGE_CONTENT,
            entity_id=content.id,
            to_status=LanguageEditorialStatus.APPROVED,
            actor=actor,
        )
        await session.flush()
    except InvalidTransitionError as exc:
        raise http_conflict_from_transition(exc) from exc
    except TransitionBlockedError as exc:
        raise http_conflict_from_guard(exc) from exc
    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "approval_conflict",
                "message": "This revision already has an active approval",
            },
        ) from exc

    await record_audit_event(
        session,
        event_type=AuditEventType.REVIEW_APPROVED,
        actor_user_id=actor.id,
        subject_type="fact_check_content",
        subject_id=content.id,
        payload={
            "language": content.language.value,
            "revision_number": content.current_revision_number,
            "review_id": str(review.id),
        },
    )
    await session.refresh(content, attribute_names=["editorial_status", "source_links"])
    return _draft_response(content)


async def reopen_language(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    language: str,
    actor: User,
    body: ReasonRequest,
) -> DraftResponse:
    reason = _require_reason(body)
    content = await _load_locked_content(session, fact_check_id=fact_check.id, language=language)

    try:
        await apply_transition(
            session,
            subject=TransitionSubject.LANGUAGE_CONTENT,
            entity_id=content.id,
            to_status=LanguageEditorialStatus.DRAFT,
            actor=actor,
            reason=reason,
        )
    except InvalidTransitionError as exc:
        raise http_conflict_from_transition(exc) from exc
    except TransitionBlockedError as exc:
        raise http_conflict_from_guard(exc) from exc

    await _invalidate_active_decisions(session, content=content, reason=reason, actor=actor)
    await record_audit_event(
        session,
        event_type=AuditEventType.REVIEW_REOPENED,
        actor_user_id=actor.id,
        subject_type="fact_check_content",
        subject_id=content.id,
        payload={"language": content.language.value, "reason": reason},
    )
    await session.flush()
    await session.refresh(content, attribute_names=["editorial_status", "source_links"])
    return _draft_response(content)


async def list_approval_queue(
    session: AsyncSession,
    *,
    user: User,
    limit: int,
    cursor: str | None,
) -> ApprovalQueueResponse:
    visible_fact_check_ids = (
        scope_factchecks(select(FactCheck.id), user).scalar_subquery()
    )
    stmt = (
        select(FactCheckContent)
        .where(
            FactCheckContent.fact_check_id.in_(visible_fact_check_ids),
            FactCheckContent.editorial_status == LanguageEditorialStatus.READY_FOR_APPROVAL,
        )
        .options(
            selectinload(FactCheckContent.fact_check).selectinload(FactCheck.investigation),
        )
        .order_by(FactCheckContent.updated_at.desc(), FactCheckContent.id.desc())
    )
    if cursor is not None:
        cursor_updated_at, cursor_id = decode_keyset_cursor(cursor)
        stmt = stmt.where(
            tuple_(FactCheckContent.updated_at, FactCheckContent.id)
            < tuple_(cursor_updated_at, cursor_id)
        )

    rows = (await session.execute(stmt.limit(limit * 3))).scalars().all()
    eligible: list[FactCheckContent] = []
    for content in rows:
        author_ids = await authors_of(session, content)
        if user.id in author_ids:
            continue
        revision = await _revision_for_number(
            session,
            content_id=content.id,
            revision_number=content.current_revision_number,
        )
        ready_editor_id = await _active_mark_ready_reviewer_id(
            session,
            content_id=content.id,
            revision_id=revision.id if revision else None,
        )
        if ready_editor_id == user.id:
            continue
        eligible.append(content)
        if len(eligible) >= limit + 1:
            break

    page = eligible[:limit]
    items = [
        ApprovalQueueItemResponse(
            fact_check_id=row.fact_check_id,
            language=LanguageCode(row.language.value),
            title=row.title,
            public_slug=row.fact_check.public_slug,
            current_revision_number=row.current_revision_number,
            updated_at=row.updated_at,
        )
        for row in page
    ]
    next_cursor = None
    if len(eligible) > limit and page:
        last_row = page[-1]
        next_cursor = encode_keyset_cursor(last_row.updated_at, last_row.id)
    return ApprovalQueueResponse(items=items, next_cursor=next_cursor)
