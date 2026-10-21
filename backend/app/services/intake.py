"""Public submissions and editorial triage workflows."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import uuid
from datetime import UTC, datetime
from typing import Any, cast

from fastapi import HTTPException, status
from sqlalchemy import func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.policy import is_editor, scope_submissions
from app.core.text_validation import TextValidationError, assert_submission_text, nfc_fingerprint
from app.core.urls import UnsafeUrlError, parse_submission_source_url
from app.db.enums import InvestigationAssignmentRole, RoleCode, SubmissionChannel, WorkflowStatus
from app.models.assignments import InvestigationAssignment
from app.models.identity import User, UserRole
from app.models.intake import Claim, Submission, SubmissionContact
from app.models.research import Investigation
from app.schemas.intake import (
    ClaimDetailResponse,
    ClaimListResponse,
    ClaimSummaryResponse,
    DuplicateSuggestionResponse,
    PublicSubmissionRequest,
    SubmissionContactResponse,
    SubmissionDetailResponse,
    SubmissionListResponse,
    SubmissionSummaryResponse,
    TriageRequest,
)
from app.services.audit import AuditEventType, record_audit_event
from app.services.captcha import CaptchaVerifier
from app.services.rate_limit import increment_rate_limit
from app.workflow.engine import apply_submission_status
from app.workflow.exceptions import InvalidTransitionError, TransitionBlockedError
from app.workflow.http import http_conflict_from_guard, http_conflict_from_transition


class IntakeValidationError(ValueError):
    """Client-facing intake validation failure."""


def submitter_key_hash(client_ip: str, settings: Settings) -> str:
    secret = settings.submission_submitter_hmac_key.get_secret_value().encode()
    return hmac.new(secret, client_ip.encode(), hashlib.sha256).hexdigest()


def encode_keyset_cursor(created_at: datetime, row_id: uuid.UUID) -> str:
    payload = {"created_at": created_at.isoformat(), "id": str(row_id)}
    return base64.urlsafe_b64encode(json.dumps(payload).encode("ascii")).decode("ascii")


def decode_keyset_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        decoded = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("ascii")
        payload = json.loads(decoded)
        created_at = datetime.fromisoformat(payload["created_at"])
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        return created_at, uuid.UUID(payload["id"])
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise IntakeValidationError("Invalid pagination cursor") from exc


async def accept_public_submission(
    session: AsyncSession,
    *,
    payload: PublicSubmissionRequest,
    settings: Settings,
    client_ip: str,
    captcha: CaptchaVerifier,
) -> uuid.UUID:
    """Persist or silently ignore a submission while always returning a receipt id."""
    receipt_id = uuid.uuid4()

    if payload.website.strip():
        return receipt_id

    if not await captcha.verify(payload.captcha_token, remote_ip=client_ip):
        return receipt_id

    ip_allowed = await increment_rate_limit(
        session,
        bucket_key=f"submission:ip:{submitter_key_hash(client_ip, settings)}",
        window_seconds=settings.submission_rate_limit_ip_window_seconds,
        max_count=settings.submission_rate_limit_ip_max,
    )
    global_allowed = await increment_rate_limit(
        session,
        bucket_key="submission:global",
        window_seconds=settings.submission_rate_limit_global_window_seconds,
        max_count=settings.submission_rate_limit_global_max,
    )
    if not ip_allowed or not global_allowed:
        return receipt_id

    try:
        assert_submission_text(payload.claim_text, field_name="claim_text")
        if payload.context_text is not None:
            assert_submission_text(payload.context_text, field_name="context_text")
        normalized_url = (
            parse_submission_source_url(payload.source_url) if payload.source_url else None
        )
    except (TextValidationError, UnsafeUrlError, ValueError):
        return receipt_id

    fingerprint = nfc_fingerprint(payload.claim_text)
    duplicate_exists = await session.scalar(
        select(func.count())
        .select_from(Submission)
        .where(Submission.text_fingerprint == fingerprint)
    )
    if duplicate_exists:
        return receipt_id

    submission = Submission(
        id=receipt_id,
        claim_text=payload.claim_text,
        context_text=payload.context_text,
        source_url=normalized_url,
        channel=SubmissionChannel.PUBLIC_FORM,
        workflow_status=WorkflowStatus.INBOX,
        text_fingerprint=fingerprint,
        submitter_key_hash=submitter_key_hash(client_ip, settings),
    )
    session.add(submission)

    if payload.contact is not None and any(
        [payload.contact.name, payload.contact.email, payload.contact.phone]
    ):
        submission.contact = SubmissionContact(
            contact_name=payload.contact.name,
            contact_email=str(payload.contact.email) if payload.contact.email else None,
            contact_phone=payload.contact.phone,
            privacy_notice_acknowledged=payload.privacy_consent,
        )

    await session.flush()
    return receipt_id


def _submission_summary(submission: Submission) -> SubmissionSummaryResponse:
    return SubmissionSummaryResponse.model_validate(submission)


async def list_submissions(
    session: AsyncSession,
    *,
    user: User,
    limit: int,
    cursor: str | None,
    workflow_status: WorkflowStatus | None,
    assigned_to_id: uuid.UUID | None,
    channel: SubmissionChannel | None,
) -> SubmissionListResponse:
    stmt = scope_submissions(select(Submission), user).order_by(
        Submission.created_at.desc(),
        Submission.id.desc(),
    )
    if workflow_status is not None:
        stmt = stmt.where(Submission.workflow_status == workflow_status)
    if assigned_to_id is not None:
        stmt = stmt.where(Submission.assigned_to_id == assigned_to_id)
    if channel is not None:
        stmt = stmt.where(Submission.channel == channel)
    if cursor is not None:
        cursor_created_at, cursor_id = decode_keyset_cursor(cursor)
        stmt = stmt.where(
            tuple_(Submission.created_at, Submission.id) < tuple_(cursor_created_at, cursor_id)
        )

    rows = cast(
        list[Submission],
        (await session.execute(stmt.limit(limit + 1))).scalars().all(),
    )
    items = [_submission_summary(row) for row in rows[:limit]]
    next_cursor = None
    if len(rows) > limit:
        last = rows[limit - 1]
        next_cursor = encode_keyset_cursor(last.created_at, last.id)
    return SubmissionListResponse(items=items, next_cursor=next_cursor)


async def _duplicate_suggestions(
    session: AsyncSession,
    *,
    submission: Submission,
    settings: Settings,
) -> list[DuplicateSuggestionResponse]:
    suggestions: list[DuplicateSuggestionResponse] = []
    if submission.text_fingerprint:
        exact_rows = (
            (
                await session.execute(
                    select(Submission).where(
                        Submission.id != submission.id,
                        Submission.text_fingerprint == submission.text_fingerprint,
                    )
                )
            )
            .scalars()
            .all()
        )
        for row in exact_rows:
            suggestions.append(
                DuplicateSuggestionResponse(
                    id=row.id,
                    claim_text=row.claim_text,
                    workflow_status=row.workflow_status,
                    similarity=1.0,
                    exact_match=True,
                )
            )

    threshold = settings.submission_duplicate_similarity_threshold
    similar_rows = (
        await session.execute(
            select(
                Submission,
                func.similarity(Submission.claim_text, submission.claim_text).label("score"),
            )
            .where(
                Submission.id != submission.id,
                func.similarity(Submission.claim_text, submission.claim_text) >= threshold,
            )
            .order_by(func.similarity(Submission.claim_text, submission.claim_text).desc())
            .limit(10)
        )
    ).all()
    seen = {item.id for item in suggestions}
    for row, score in similar_rows:
        if row.id in seen:
            continue
        suggestions.append(
            DuplicateSuggestionResponse(
                id=row.id,
                claim_text=row.claim_text,
                workflow_status=row.workflow_status,
                similarity=float(score),
                exact_match=False,
            )
        )
        seen.add(row.id)
    return suggestions


async def get_submission_detail(
    session: AsyncSession,
    *,
    submission: Submission,
    settings: Settings,
) -> SubmissionDetailResponse:
    claim = None
    if submission.claim_id is not None:
        claim_row = await session.get(Claim, submission.claim_id)
        if claim_row is not None:
            claim = ClaimSummaryResponse.model_validate(claim_row)
    duplicates = await _duplicate_suggestions(session, submission=submission, settings=settings)
    return SubmissionDetailResponse(
        submission=_submission_summary(submission),
        claim=claim,
        duplicate_suggestions=duplicates,
    )


async def get_submission_contact(
    session: AsyncSession,
    *,
    submission: Submission,
    actor_user_id: uuid.UUID,
) -> SubmissionContactResponse | None:
    await record_audit_event(
        session,
        event_type=AuditEventType.SUBMISSION_CONTACT_VIEWED,
        actor_user_id=actor_user_id,
        subject_type="submission",
        subject_id=submission.id,
    )
    if submission.contact is None:
        return None
    return SubmissionContactResponse(
        contact_name=submission.contact.contact_name,
        contact_email=submission.contact.contact_email,
        contact_phone=submission.contact.contact_phone,
        privacy_notice_acknowledged=submission.contact.privacy_notice_acknowledged,
    )


async def _load_submission_for_update(
    session: AsyncSession,
    submission_id: uuid.UUID,
) -> Submission | None:
    result = await session.execute(
        select(Submission)
        .where(Submission.id == submission_id)
        .options(selectinload(Submission.contact))
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def _editorial_staff_user(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await session.execute(
        select(User)
        .where(User.id == user_id, User.is_active.is_(True))
        .options(selectinload(User.roles).selectinload(UserRole.role))
    )
    user = result.scalar_one_or_none()
    if user is None:
        return None
    allowed = {RoleCode.RESEARCHER, RoleCode.EDITOR, RoleCode.APPROVER}
    if not {assignment.role.code for assignment in user.roles}.intersection(allowed):
        return None
    return user


async def apply_triage_action(
    session: AsyncSession,
    *,
    submission_id: uuid.UUID,
    actor: User,
    body: TriageRequest,
    settings: Settings,
) -> SubmissionDetailResponse:
    submission = await _load_submission_for_update(session, submission_id)
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    audit_payload: dict[str, Any] = {"action": body.action}

    async def transition_submission(
        to_status: WorkflowStatus,
        *,
        reason: str | None = None,
    ) -> None:
        if submission.workflow_status == to_status:
            return
        try:
            await apply_submission_status(
                session,
                submission=submission,
                to_status=to_status,
                actor=actor,
                reason=reason,
            )
        except InvalidTransitionError as exc:
            raise http_conflict_from_transition(exc) from exc
        except TransitionBlockedError as exc:
            raise http_conflict_from_guard(exc) from exc

    if body.action == "reject":
        await transition_submission(WorkflowStatus.REJECTED, reason=body.reason)
    elif body.action == "hold":
        await transition_submission(WorkflowStatus.ON_HOLD, reason=body.reason)
    elif body.action == "mark_duplicate":
        duplicate = await session.get(Submission, body.duplicate_of_id)
        if duplicate is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)
        submission.duplicate_of_id = body.duplicate_of_id
        audit_payload["duplicate_of_id"] = str(body.duplicate_of_id)
    elif body.action == "link_to_claim":
        claim = await session.get(Claim, body.claim_id)
        if claim is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)
        submission.claim_id = body.claim_id
        audit_payload["claim_id"] = str(body.claim_id)
    elif body.action == "create_claim":
        claim = Claim(canonical_text=body.canonical_text, created_by_id=actor.id)
        session.add(claim)
        await session.flush()
        submission.claim_id = claim.id
        audit_payload["claim_id"] = str(claim.id)
    elif body.action == "assign":
        if not is_editor(actor):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        assignee = await _editorial_staff_user(session, body.user_id)
        if assignee is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)
        submission.assigned_to_id = body.user_id
        audit_payload["assigned_to_id"] = str(body.user_id)
    elif body.action == "open_investigation":
        claim_id = submission.claim_id
        if claim_id is None:
            claim = Claim(canonical_text=submission.claim_text, created_by_id=actor.id)
            session.add(claim)
            await session.flush()
            claim_id = claim.id
            submission.claim_id = claim_id
        investigation = Investigation(
            claim_id=claim_id,
            owner_id=actor.id,
            workflow_status=WorkflowStatus.RESEARCHING,
            created_by_id=actor.id,
        )
        session.add(investigation)
        await session.flush()
        session.add(
            InvestigationAssignment(
                investigation_id=investigation.id,
                user_id=actor.id,
                assignment_role=InvestigationAssignmentRole.OWNER,
                assigned_by_id=actor.id,
            )
        )
        audit_payload["investigation_id"] = str(investigation.id)
    else:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    if body.action not in {"reject", "hold"}:
        await transition_submission(WorkflowStatus.TRIAGED)

    submission.triaged_by_id = actor.id
    submission.triaged_at = datetime.now(UTC)
    await record_audit_event(
        session,
        event_type=AuditEventType.SUBMISSION_TRIAGED,
        actor_user_id=actor.id,
        subject_type="submission",
        subject_id=submission.id,
        payload=audit_payload,
    )
    await session.flush()
    await session.refresh(submission)
    return await get_submission_detail(session, submission=submission, settings=settings)


async def list_claims(
    session: AsyncSession,
    *,
    limit: int,
    cursor: str | None,
) -> ClaimListResponse:
    stmt = select(Claim).order_by(Claim.created_at.desc(), Claim.id.desc())
    if cursor is not None:
        cursor_created_at, cursor_id = decode_keyset_cursor(cursor)
        stmt = stmt.where(tuple_(Claim.created_at, Claim.id) < tuple_(cursor_created_at, cursor_id))
    rows = cast(
        list[Claim],
        (await session.execute(stmt.limit(limit + 1))).scalars().all(),
    )
    items = [ClaimSummaryResponse.model_validate(row) for row in rows[:limit]]
    next_cursor = None
    if len(rows) > limit:
        last = rows[limit - 1]
        next_cursor = encode_keyset_cursor(last.created_at, last.id)
    return ClaimListResponse(items=items, next_cursor=next_cursor)


async def get_claim_detail(
    session: AsyncSession,
    *,
    claim_id: uuid.UUID,
) -> ClaimDetailResponse | None:
    claim = await session.get(Claim, claim_id)
    if claim is None:
        return None
    submissions = (
        (
            await session.execute(
                select(Submission)
                .where(Submission.claim_id == claim.id)
                .order_by(Submission.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return ClaimDetailResponse(
        claim=ClaimSummaryResponse.model_validate(claim),
        submissions=[_submission_summary(row) for row in submissions],
    )
