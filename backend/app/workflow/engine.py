"""Central transition engine for submissions, investigations, and language drafts."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.enums import LanguageEditorialStatus, WorkflowStatus
from app.models.identity import User
from app.models.intake import Submission
from app.models.publication import FactCheck, FactCheckContent
from app.models.research import Investigation
from app.services.audit import AuditEventType, record_audit_event
from app.workflow.exceptions import InvalidTransitionError, TransitionBlockedError
from app.workflow.rollup import recompute_workflow_rollup
from app.workflow.transitions import (
    investigation_allows,
    language_content_allows,
    submission_allows,
)


class TransitionSubject(StrEnum):
    SUBMISSION = "submission"
    INVESTIGATION = "investigation"
    LANGUAGE_CONTENT = "language_content"


@dataclass(frozen=True, slots=True)
class GuardContext:
    """Optional guard inputs for language-content transitions."""

    skip_investigation_freeze: bool = False


async def apply_transition(
    session: AsyncSession,
    *,
    subject: TransitionSubject,
    entity_id: uuid.UUID,
    to_status: WorkflowStatus | LanguageEditorialStatus,
    actor: User,
    reason: str | None = None,
    guard_ctx: GuardContext | None = None,
) -> Submission | Investigation | FactCheckContent:
    if subject == TransitionSubject.SUBMISSION:
        return await _apply_submission_transition(
            session,
            submission_id=entity_id,
            to_status=to_status,
            actor=actor,
            reason=reason,
        )
    if subject == TransitionSubject.INVESTIGATION:
        if not isinstance(to_status, WorkflowStatus):
            raise InvalidTransitionError(
                subject=subject.value,
                from_status="",
                to_status=str(to_status),
            )
        return await _apply_investigation_transition(
            session,
            investigation_id=entity_id,
            to_status=to_status,
            actor=actor,
            reason=reason,
        )
    if subject == TransitionSubject.LANGUAGE_CONTENT:
        if not isinstance(to_status, LanguageEditorialStatus):
            raise InvalidTransitionError(
                subject=subject.value,
                from_status="",
                to_status=str(to_status),
            )
        return await _apply_language_content_transition(
            session,
            content_id=entity_id,
            to_status=to_status,
            actor=actor,
            reason=reason,
            guard_ctx=guard_ctx or GuardContext(),
        )
    raise InvalidTransitionError(subject=subject.value, from_status="", to_status=str(to_status))


async def _apply_submission_transition(
    session: AsyncSession,
    *,
    submission_id: uuid.UUID,
    to_status: WorkflowStatus | LanguageEditorialStatus,
    actor: User,
    reason: str | None,
) -> Submission:
    if not isinstance(to_status, WorkflowStatus):
        raise InvalidTransitionError(
            subject=TransitionSubject.SUBMISSION.value,
            from_status="",
            to_status=str(to_status),
        )
    result = await session.execute(
        select(Submission).where(Submission.id == submission_id).with_for_update()
    )
    submission = result.scalar_one_or_none()
    if submission is None:
        raise InvalidTransitionError(
            subject=TransitionSubject.SUBMISSION.value,
            from_status="",
            to_status=to_status.value,
        )

    from_status = submission.workflow_status
    if not submission_allows(from_status, to_status):
        raise InvalidTransitionError(
            subject=TransitionSubject.SUBMISSION.value,
            from_status=from_status.value,
            to_status=to_status.value,
        )

    submission.workflow_status = to_status
    if to_status == WorkflowStatus.REJECTED or to_status == WorkflowStatus.ON_HOLD:
        submission.triage_note = reason

    payload: dict[str, Any] = {
        "from_status": from_status.value,
        "to_status": to_status.value,
    }
    if reason:
        payload["reason"] = reason

    await record_audit_event(
        session,
        event_type=AuditEventType.WORKFLOW_TRANSITION,
        actor_user_id=actor.id,
        subject_type="submission",
        subject_id=submission.id,
        payload={**payload, "subject": TransitionSubject.SUBMISSION.value},
    )
    await session.flush()
    return submission


async def _apply_investigation_transition(
    session: AsyncSession,
    *,
    investigation_id: uuid.UUID,
    to_status: WorkflowStatus,
    actor: User,
    reason: str | None,
) -> Investigation:
    result = await session.execute(
        select(Investigation)
        .where(Investigation.id == investigation_id)
        .options(selectinload(Investigation.fact_check))
        .with_for_update()
    )
    investigation = result.scalar_one_or_none()
    if investigation is None:
        raise InvalidTransitionError(
            subject=TransitionSubject.INVESTIGATION.value,
            from_status="",
            to_status=to_status.value,
        )

    from_status = investigation.workflow_status
    resolved_to = to_status

    if from_status == WorkflowStatus.ON_HOLD:
        if investigation.hold_from_status is None:
            raise InvalidTransitionError(
                subject=TransitionSubject.INVESTIGATION.value,
                from_status=from_status.value,
                to_status=to_status.value,
            )
        if to_status != investigation.hold_from_status:
            raise InvalidTransitionError(
                subject=TransitionSubject.INVESTIGATION.value,
                from_status=from_status.value,
                to_status=to_status.value,
            )
        resolved_to = investigation.hold_from_status
    elif not investigation_allows(from_status, to_status):
        raise InvalidTransitionError(
            subject=TransitionSubject.INVESTIGATION.value,
            from_status=from_status.value,
            to_status=to_status.value,
        )

    if to_status == WorkflowStatus.ON_HOLD:
        investigation.hold_from_status = from_status
        investigation.hold_reason = reason
    elif from_status == WorkflowStatus.ON_HOLD:
        investigation.hold_from_status = None
        investigation.hold_reason = None
    elif to_status == WorkflowStatus.REJECTED:
        investigation.reject_reason = reason
    elif to_status == WorkflowStatus.RESEARCHING and from_status != WorkflowStatus.ON_HOLD:
        investigation.hold_reason = None

    investigation.workflow_status = resolved_to
    investigation.updated_by_id = actor.id

    await record_audit_event(
        session,
        event_type=AuditEventType.INVESTIGATION_STATUS_CHANGED,
        actor_user_id=actor.id,
        subject_type="investigation",
        subject_id=investigation.id,
        payload={
            "from_status": from_status.value,
            "to_status": resolved_to.value,
            **({"reason": reason} if reason else {}),
        },
    )
    await session.flush()

    if investigation.fact_check is not None:
        await recompute_workflow_rollup(session, fact_check=investigation.fact_check)
        await session.flush()

    return investigation


async def _apply_language_content_transition(
    session: AsyncSession,
    *,
    content_id: uuid.UUID,
    to_status: LanguageEditorialStatus,
    actor: User,
    reason: str | None,
    guard_ctx: GuardContext,
) -> FactCheckContent:
    result = await session.execute(
        select(FactCheckContent)
        .where(FactCheckContent.id == content_id)
        .options(selectinload(FactCheckContent.fact_check).selectinload(FactCheck.investigation))
        .with_for_update()
    )
    content = result.scalar_one_or_none()
    if content is None:
        raise InvalidTransitionError(
            subject=TransitionSubject.LANGUAGE_CONTENT.value,
            from_status="",
            to_status=to_status.value,
        )

    investigation = content.fact_check.investigation if content.fact_check else None
    if (
        not guard_ctx.skip_investigation_freeze
        and investigation is not None
        and investigation.workflow_status in {WorkflowStatus.ON_HOLD, WorkflowStatus.REJECTED}
    ):
        raise TransitionBlockedError(
            code="investigation_frozen",
            message="Language workflow is blocked while the investigation is on hold or rejected",
        )

    from_status = content.editorial_status
    if not language_content_allows(from_status, to_status):
        raise InvalidTransitionError(
            subject=TransitionSubject.LANGUAGE_CONTENT.value,
            from_status=from_status.value,
            to_status=to_status.value,
        )

    content.editorial_status = to_status
    content.updated_by_id = actor.id

    payload: dict[str, Any] = {
        "from_status": from_status.value,
        "to_status": to_status.value,
        "language": content.language.value,
    }
    if reason:
        payload["reason"] = reason

    await record_audit_event(
        session,
        event_type=AuditEventType.WORKFLOW_TRANSITION,
        actor_user_id=actor.id,
        subject_type="fact_check_content",
        subject_id=content.id,
        payload={**payload, "subject": TransitionSubject.LANGUAGE_CONTENT.value},
    )

    fact_check = content.fact_check
    if fact_check is not None:
        await recompute_workflow_rollup(session, fact_check=fact_check)
    await session.flush()
    return content


async def apply_submission_status(
    session: AsyncSession,
    *,
    submission: Submission,
    to_status: WorkflowStatus,
    actor: User,
    reason: str | None = None,
) -> Submission:
    return await apply_transition(
        session,
        subject=TransitionSubject.SUBMISSION,
        entity_id=submission.id,
        to_status=to_status,
        actor=actor,
        reason=reason,
    )


async def apply_investigation_status(
    session: AsyncSession,
    *,
    investigation: Investigation,
    to_status: WorkflowStatus,
    actor: User,
    reason: str | None = None,
) -> Investigation:
    loaded = await session.execute(
        select(Investigation)
        .where(Investigation.id == investigation.id)
        .options(selectinload(Investigation.fact_check))
    )
    row = loaded.scalar_one()
    return await apply_transition(
        session,
        subject=TransitionSubject.INVESTIGATION,
        entity_id=row.id,
        to_status=to_status,
        actor=actor,
        reason=reason,
    )
