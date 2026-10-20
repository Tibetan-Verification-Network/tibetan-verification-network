"""Investigation workspace lifecycle and assignments."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import cast

from fastapi import HTTPException, status
from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.policy import scope_investigations
from app.db.enums import InvestigationAssignmentRole, WorkflowStatus
from app.models.assignments import InvestigationAssignment
from app.models.identity import User
from app.models.intake import Claim, Submission
from app.models.research import Investigation
from app.schemas.intake import ClaimSummaryResponse
from app.schemas.investigations import (
    AssignmentCreateRequest,
    AssignmentSummaryResponse,
    EvidenceResponse,
    InvestigationCreateRequest,
    InvestigationDetailResponse,
    InvestigationListResponse,
    InvestigationPatchRequest,
    InvestigationStatusRequest,
    InvestigationSummaryResponse,
    SourceResponse,
)
from app.services.audit import AuditEventType, record_audit_event
from app.services.intake import _editorial_staff_user, decode_keyset_cursor, encode_keyset_cursor


def _active_assignments(investigation: Investigation) -> list[InvestigationAssignment]:
    return [row for row in investigation.assignments if row.removed_at is None]


def _assignment_responses(investigation: Investigation) -> list[AssignmentSummaryResponse]:
    return [
        AssignmentSummaryResponse.model_validate(row) for row in _active_assignments(investigation)
    ]


def _investigation_detail(investigation: Investigation) -> InvestigationDetailResponse:
    sources = sorted(
        investigation.sources,
        key=lambda row: (row.position is None, row.position or 0, row.created_at),
    )
    evidence = sorted(
        investigation.evidence_items,
        key=lambda row: (row.position is None, row.position or 0, row.created_at),
    )
    return InvestigationDetailResponse(
        investigation=InvestigationSummaryResponse.model_validate(investigation),
        claim=ClaimSummaryResponse.model_validate(investigation.claim),
        internal_notes=investigation.internal_notes,
        hold_reason=investigation.hold_reason,
        reject_reason=investigation.reject_reason,
        assignments=_assignment_responses(investigation),
        sources=[SourceResponse.model_validate(row) for row in sources],
        evidence_items=[EvidenceResponse.model_validate(row) for row in evidence],
    )


async def _load_investigation_graph(
    session: AsyncSession,
    investigation_id: uuid.UUID,
) -> Investigation | None:
    result = await session.execute(
        select(Investigation)
        .where(Investigation.id == investigation_id)
        .options(
            selectinload(Investigation.claim),
            selectinload(Investigation.assignments),
            selectinload(Investigation.sources),
            selectinload(Investigation.evidence_items),
        )
    )
    return result.scalar_one_or_none()


async def create_investigation(
    session: AsyncSession,
    *,
    actor: User,
    body: InvestigationCreateRequest,
) -> InvestigationDetailResponse:
    claim_id = body.claim_id
    if body.submission_id is not None:
        submission = await session.get(Submission, body.submission_id)
        if submission is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)
        claim_id = submission.claim_id
        if claim_id is None:
            claim = Claim(canonical_text=submission.claim_text, created_by_id=actor.id)
            session.add(claim)
            await session.flush()
            claim_id = claim.id
            submission.claim_id = claim_id
    assert claim_id is not None
    if await session.get(Claim, claim_id) is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    investigation = Investigation(
        claim_id=claim_id,
        owner_id=actor.id,
        workflow_status=WorkflowStatus.RESEARCHING,
        created_by_id=actor.id,
        updated_by_id=actor.id,
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
    await record_audit_event(
        session,
        event_type=AuditEventType.INVESTIGATION_CREATED,
        actor_user_id=actor.id,
        subject_type="investigation",
        subject_id=investigation.id,
        payload={"claim_id": str(claim_id)},
    )
    await session.flush()
    loaded = await _load_investigation_graph(session, investigation.id)
    assert loaded is not None
    return _investigation_detail(loaded)


async def list_investigations(
    session: AsyncSession,
    *,
    user: User,
    limit: int,
    cursor: str | None,
    mine: bool = False,
    workflow_status: WorkflowStatus | None = None,
    owner_id: uuid.UUID | None = None,
) -> InvestigationListResponse:
    stmt = scope_investigations(select(Investigation), user).order_by(
        Investigation.created_at.desc(),
        Investigation.id.desc(),
    )
    if mine:
        stmt = stmt.where(Investigation.owner_id == user.id)
    if workflow_status is not None:
        stmt = stmt.where(Investigation.workflow_status == workflow_status)
    if owner_id is not None:
        stmt = stmt.where(Investigation.owner_id == owner_id)
    if cursor is not None:
        cursor_created_at, cursor_id = decode_keyset_cursor(cursor)
        stmt = stmt.where(
            tuple_(Investigation.created_at, Investigation.id)
            < tuple_(cursor_created_at, cursor_id)
        )

    rows = cast(
        list[Investigation],
        (await session.execute(stmt.limit(limit + 1))).scalars().all(),
    )
    items = [InvestigationSummaryResponse.model_validate(row) for row in rows[:limit]]
    next_cursor = None
    if len(rows) > limit:
        last = rows[limit - 1]
        next_cursor = encode_keyset_cursor(last.created_at, last.id)
    return InvestigationListResponse(items=items, next_cursor=next_cursor)


async def get_investigation_detail(
    session: AsyncSession,
    *,
    investigation: Investigation,
) -> InvestigationDetailResponse:
    loaded = await _load_investigation_graph(session, investigation.id)
    if loaded is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return _investigation_detail(loaded)


async def patch_investigation(
    session: AsyncSession,
    *,
    investigation: Investigation,
    actor: User,
    body: InvestigationPatchRequest,
) -> InvestigationDetailResponse:
    if body.internal_notes is not None:
        investigation.internal_notes = body.internal_notes
    investigation.updated_by_id = actor.id
    await session.flush()
    return await get_investigation_detail(session, investigation=investigation)


async def change_investigation_status(
    session: AsyncSession,
    *,
    investigation: Investigation,
    actor: User,
    body: InvestigationStatusRequest,
) -> InvestigationDetailResponse:
    previous = investigation.workflow_status
    investigation.workflow_status = body.status
    if body.status == WorkflowStatus.ON_HOLD:
        investigation.hold_reason = body.reason
    elif body.status == WorkflowStatus.RESEARCHING:
        investigation.hold_reason = None
    investigation.updated_by_id = actor.id
    await record_audit_event(
        session,
        event_type=AuditEventType.INVESTIGATION_STATUS_CHANGED,
        actor_user_id=actor.id,
        subject_type="investigation",
        subject_id=investigation.id,
        payload={
            "from_status": previous.value,
            "to_status": body.status.value,
        },
    )
    await session.flush()
    return await get_investigation_detail(session, investigation=investigation)


async def _sync_owner_from_assignments(
    session: AsyncSession,
    investigation: Investigation,
) -> None:
    owner_assignment = next(
        (
            row
            for row in _active_assignments(investigation)
            if row.assignment_role == InvestigationAssignmentRole.OWNER
        ),
        None,
    )
    investigation.owner_id = owner_assignment.user_id if owner_assignment else None
    await session.flush()


async def add_assignment(
    session: AsyncSession,
    *,
    investigation: Investigation,
    actor: User,
    body: AssignmentCreateRequest,
) -> InvestigationDetailResponse:
    assignee = await _editorial_staff_user(session, body.user_id)
    if assignee is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    existing = next(
        (
            row
            for row in investigation.assignments
            if row.user_id == body.user_id and row.removed_at is None
        ),
        None,
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    if body.assignment_role == InvestigationAssignmentRole.OWNER:
        for row in _active_assignments(investigation):
            if row.assignment_role == InvestigationAssignmentRole.OWNER:
                row.removed_at = datetime.now(UTC)
                await record_audit_event(
                    session,
                    event_type=AuditEventType.INVESTIGATION_UNASSIGNED,
                    actor_user_id=actor.id,
                    subject_type="investigation",
                    subject_id=investigation.id,
                    payload={"user_id": str(row.user_id), "reason": "owner_replaced"},
                )

    session.add(
        InvestigationAssignment(
            investigation_id=investigation.id,
            user_id=body.user_id,
            assignment_role=body.assignment_role,
            assigned_by_id=actor.id,
        )
    )
    await record_audit_event(
        session,
        event_type=AuditEventType.INVESTIGATION_ASSIGNED,
        actor_user_id=actor.id,
        subject_type="investigation",
        subject_id=investigation.id,
        payload={
            "user_id": str(body.user_id),
            "assignment_role": body.assignment_role.value,
        },
    )
    await session.flush()
    await session.refresh(investigation, attribute_names=["assignments"])
    await _sync_owner_from_assignments(session, investigation)
    return await get_investigation_detail(session, investigation=investigation)


async def remove_assignment(
    session: AsyncSession,
    *,
    investigation: Investigation,
    actor: User,
    user_id: uuid.UUID,
) -> InvestigationDetailResponse:
    active = _active_assignments(investigation)
    target = next((row for row in active if row.user_id == user_id), None)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    owners = [row for row in active if row.assignment_role == InvestigationAssignmentRole.OWNER]
    if target.assignment_role == InvestigationAssignmentRole.OWNER and len(owners) <= 1:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    target.removed_at = datetime.now(UTC)
    await record_audit_event(
        session,
        event_type=AuditEventType.INVESTIGATION_UNASSIGNED,
        actor_user_id=actor.id,
        subject_type="investigation",
        subject_id=investigation.id,
        payload={"user_id": str(user_id)},
    )
    await session.flush()
    await _sync_owner_from_assignments(session, investigation)
    return await get_investigation_detail(session, investigation=investigation)
