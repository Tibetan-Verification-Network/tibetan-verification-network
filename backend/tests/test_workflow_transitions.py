"""Transition table coverage for the workflow engine."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import (
    ArticleVersionKind,
    LanguageCode,
    LanguageEditorialStatus,
    ReviewDecision,
    RoleCode,
    WorkflowStatus,
)
from app.models.publication import ArticleVersion, FactCheck, FactCheckContent, Review
from app.workflow.engine import TransitionSubject, apply_transition
from app.workflow.exceptions import InvalidTransitionError, TransitionBlockedError
from app.workflow.transitions import (
    INVESTIGATION_TRANSITIONS,
    LANGUAGE_CONTENT_TRANSITIONS,
    SUBMISSION_TRANSITIONS,
    all_investigation_pairs,
    all_language_content_pairs,
    all_submission_pairs,
    investigation_allows,
    language_content_allows,
    submission_allows,
)
from tests.factories import make_investigation, make_submission, make_user

pytestmark = pytest.mark.usefixtures("db_session")

LANGUAGE_CONTENT_TRANSITION_CASES = sorted(
    (
        pair
        for pair in all_language_content_pairs()
        if pair != (LanguageEditorialStatus.APPROVED, LanguageEditorialStatus.PUBLISHED)
    ),
    key=lambda pair: (pair[0].value, pair[1].value),
)


async def _seed_language_content(
    db_session: AsyncSession,
    *,
    owner,
    editorial_status: LanguageEditorialStatus,
) -> FactCheckContent:
    investigation = await make_investigation(db_session, owner=owner)
    fact_check = FactCheck(investigation_id=investigation.id, workflow_status=WorkflowStatus.DRAFTING)
    content = FactCheckContent(language=LanguageCode.EN, editorial_status=LanguageEditorialStatus.DRAFT)
    fact_check.contents = [content]
    db_session.add(fact_check)
    await db_session.flush()

    if editorial_status == LanguageEditorialStatus.DRAFT:
        return content

    actor = owner
    if editorial_status in {
        LanguageEditorialStatus.PUBLISHED,
        LanguageEditorialStatus.WITHDRAWN,
    }:
        review = Review(
            fact_check_content_id=content.id,
            reviewer_id=actor.id,
            decision=ReviewDecision.APPROVE,
        )
        db_session.add(review)
        await db_session.flush()
        version = ArticleVersion(
            fact_check_content_id=content.id,
            fact_check_id=fact_check.id,
            language=LanguageCode.EN,
            version_number=1,
            kind=ArticleVersionKind.INITIAL,
            approval_review_id=review.id,
            snapshot={"schema_version": 1},
            published_at=datetime.now(UTC),
            published_by_id=actor.id,
            content_checksum="deadbeef",
        )
        db_session.add(version)
        await db_session.flush()
        content.live_version_id = version.id
        content.editorial_status = LanguageEditorialStatus.PUBLISHED
        if editorial_status == LanguageEditorialStatus.WITHDRAWN:
            content.editorial_status = LanguageEditorialStatus.WITHDRAWN
        await db_session.flush()
        return content

    content.editorial_status = editorial_status
    await db_session.flush()
    return content


def test_submission_transition_table_matches_helper() -> None:
    pairs: set[tuple[WorkflowStatus, WorkflowStatus]] = set()
    for from_status, targets in SUBMISSION_TRANSITIONS.items():
        for to_status in targets:
            pairs.add((from_status, to_status))
            assert submission_allows(from_status, to_status)
    assert pairs == set(all_submission_pairs())


def test_investigation_transition_table_matches_helper() -> None:
    pairs: set[tuple[WorkflowStatus, WorkflowStatus]] = set()
    for from_status, targets in INVESTIGATION_TRANSITIONS.items():
        for to_status in targets:
            pairs.add((from_status, to_status))
            assert investigation_allows(from_status, to_status)
    assert pairs == set(all_investigation_pairs())


def test_language_content_transition_table_matches_helper() -> None:
    pairs: set[tuple[LanguageEditorialStatus, LanguageEditorialStatus]] = set()
    for from_status, targets in LANGUAGE_CONTENT_TRANSITIONS.items():
        for to_status in targets:
            pairs.add((from_status, to_status))
            assert language_content_allows(from_status, to_status)
    assert pairs == set(all_language_content_pairs())


@pytest.mark.parametrize(
    ("from_status", "to_status"),
    sorted(all_submission_pairs(), key=lambda pair: (pair[0].value, pair[1].value)),
)
async def test_submission_allowed_transitions_succeed(
    db_session: AsyncSession,
    from_status: WorkflowStatus,
    to_status: WorkflowStatus,
) -> None:
    actor = await make_user(db_session, roles=(RoleCode.EDITOR,))
    submission = await make_submission(db_session, workflow_status=from_status)
    updated = await apply_transition(
        db_session,
        subject=TransitionSubject.SUBMISSION,
        entity_id=submission.id,
        to_status=to_status,
        actor=actor,
        reason="Transition reason" if to_status in {WorkflowStatus.ON_HOLD, WorkflowStatus.REJECTED} else None,
    )
    assert updated.workflow_status == to_status


@pytest.mark.parametrize(
    "from_status",
    sorted(SUBMISSION_TRANSITIONS.keys(), key=lambda status: status.value),
)
async def test_submission_forbidden_transitions_raise(
    db_session: AsyncSession,
    from_status: WorkflowStatus,
) -> None:
    actor = await make_user(db_session, roles=(RoleCode.EDITOR,))
    submission = await make_submission(db_session, workflow_status=from_status)
    allowed = SUBMISSION_TRANSITIONS[from_status]
    forbidden = [status for status in WorkflowStatus if status not in allowed]
    for to_status in forbidden:
        with pytest.raises(InvalidTransitionError):
            await apply_transition(
                db_session,
                subject=TransitionSubject.SUBMISSION,
                entity_id=submission.id,
                to_status=to_status,
                actor=actor,
            )
        await db_session.rollback()


@pytest.mark.parametrize(
    ("from_status", "to_status"),
    sorted(all_investigation_pairs(), key=lambda pair: (pair[0].value, pair[1].value)),
)
async def test_investigation_allowed_transitions_succeed(
    db_session: AsyncSession,
    from_status: WorkflowStatus,
    to_status: WorkflowStatus,
) -> None:
    actor = await make_user(db_session, roles=(RoleCode.RESEARCHER,))
    investigation = await make_investigation(db_session, owner=actor)
    if from_status != WorkflowStatus.RESEARCHING:
        investigation.workflow_status = from_status
        if from_status == WorkflowStatus.ON_HOLD:
            investigation.hold_from_status = to_status
        await db_session.flush()

    resolved_to = to_status
    updated = await apply_transition(
        db_session,
        subject=TransitionSubject.INVESTIGATION,
        entity_id=investigation.id,
        to_status=to_status,
        actor=actor,
        reason="Hold reason"
        if to_status in {WorkflowStatus.ON_HOLD, WorkflowStatus.REJECTED}
        else None,
    )
    assert updated.workflow_status == resolved_to


async def test_investigation_on_hold_restores_hold_from_status(
    db_session: AsyncSession,
) -> None:
    actor = await make_user(db_session, roles=(RoleCode.RESEARCHER,))
    investigation = await make_investigation(db_session, owner=actor)
    await apply_transition(
        db_session,
        subject=TransitionSubject.INVESTIGATION,
        entity_id=investigation.id,
        to_status=WorkflowStatus.DRAFTING,
        actor=actor,
    )
    await apply_transition(
        db_session,
        subject=TransitionSubject.INVESTIGATION,
        entity_id=investigation.id,
        to_status=WorkflowStatus.ON_HOLD,
        actor=actor,
        reason="Paused",
    )
    await apply_transition(
        db_session,
        subject=TransitionSubject.INVESTIGATION,
        entity_id=investigation.id,
        to_status=WorkflowStatus.DRAFTING,
        actor=actor,
    )
    await db_session.refresh(investigation)
    assert investigation.workflow_status == WorkflowStatus.DRAFTING
    assert investigation.hold_from_status is None


async def test_language_content_blocked_when_investigation_on_hold(
    db_session: AsyncSession,
) -> None:
    actor = await make_user(db_session, roles=(RoleCode.RESEARCHER,))
    investigation = await make_investigation(db_session, owner=actor)
    fact_check = FactCheck(investigation_id=investigation.id, workflow_status=WorkflowStatus.DRAFTING)
    fact_check.contents = [
        FactCheckContent(language=LanguageCode.EN, editorial_status=LanguageEditorialStatus.DRAFT),
    ]
    db_session.add(fact_check)
    await db_session.flush()
    content = fact_check.contents[0]

    investigation.workflow_status = WorkflowStatus.ON_HOLD
    investigation.hold_from_status = WorkflowStatus.RESEARCHING
    await db_session.flush()

    with pytest.raises(TransitionBlockedError):
        await apply_transition(
            db_session,
            subject=TransitionSubject.LANGUAGE_CONTENT,
            entity_id=content.id,
            to_status=LanguageEditorialStatus.IN_REVIEW,
            actor=actor,
        )


@pytest.mark.parametrize(
    ("from_status", "to_status"),
    LANGUAGE_CONTENT_TRANSITION_CASES,
)
async def test_language_content_allowed_transitions_succeed(
    db_session: AsyncSession,
    from_status: LanguageEditorialStatus,
    to_status: LanguageEditorialStatus,
) -> None:
    actor = await make_user(db_session, roles=(RoleCode.EDITOR,))
    content = await _seed_language_content(
        db_session,
        owner=actor,
        editorial_status=from_status,
    )

    updated = await apply_transition(
        db_session,
        subject=TransitionSubject.LANGUAGE_CONTENT,
        entity_id=content.id,
        to_status=to_status,
        actor=actor,
    )
    assert updated.editorial_status == to_status


async def test_missing_entity_raises_invalid_transition(db_session: AsyncSession) -> None:
    actor = await make_user(db_session, roles=(RoleCode.EDITOR,))
    with pytest.raises(InvalidTransitionError):
        await apply_transition(
            db_session,
            subject=TransitionSubject.SUBMISSION,
            entity_id=uuid.uuid4(),
            to_status=WorkflowStatus.TRIAGED,
            actor=actor,
        )
