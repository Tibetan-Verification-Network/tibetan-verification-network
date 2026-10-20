"""Explicit allow-lists for workflow status changes."""

from __future__ import annotations

from app.db.enums import LanguageEditorialStatus, WorkflowStatus

SUBMISSION_TRANSITIONS: dict[WorkflowStatus, frozenset[WorkflowStatus]] = {
    WorkflowStatus.INBOX: frozenset(
        {
            WorkflowStatus.TRIAGED,
            WorkflowStatus.REJECTED,
            WorkflowStatus.ON_HOLD,
        }
    ),
    WorkflowStatus.ON_HOLD: frozenset(
        {
            WorkflowStatus.INBOX,
            WorkflowStatus.TRIAGED,
            WorkflowStatus.REJECTED,
        }
    ),
    WorkflowStatus.TRIAGED: frozenset(
        {
            WorkflowStatus.ON_HOLD,
            WorkflowStatus.REJECTED,
        }
    ),
}

INVESTIGATION_TRANSITIONS: dict[WorkflowStatus, frozenset[WorkflowStatus]] = {
    WorkflowStatus.RESEARCHING: frozenset(
        {
            WorkflowStatus.DRAFTING,
            WorkflowStatus.ON_HOLD,
            WorkflowStatus.REJECTED,
        }
    ),
    WorkflowStatus.DRAFTING: frozenset(
        {
            WorkflowStatus.RESEARCHING,
            WorkflowStatus.ON_HOLD,
            WorkflowStatus.REJECTED,
        }
    ),
    WorkflowStatus.ON_HOLD: frozenset({WorkflowStatus.RESEARCHING, WorkflowStatus.DRAFTING}),
}

LANGUAGE_CONTENT_TRANSITIONS: dict[LanguageEditorialStatus, frozenset[LanguageEditorialStatus]] = {
    LanguageEditorialStatus.DRAFT: frozenset({LanguageEditorialStatus.IN_REVIEW}),
    LanguageEditorialStatus.IN_REVIEW: frozenset(
        {
            LanguageEditorialStatus.CHANGES_REQUESTED,
            LanguageEditorialStatus.READY_FOR_APPROVAL,
            LanguageEditorialStatus.DRAFT,
        }
    ),
    LanguageEditorialStatus.CHANGES_REQUESTED: frozenset({LanguageEditorialStatus.DRAFT}),
    LanguageEditorialStatus.READY_FOR_APPROVAL: frozenset(
        {
            LanguageEditorialStatus.CHANGES_REQUESTED,
            LanguageEditorialStatus.APPROVED,
            LanguageEditorialStatus.DRAFT,
        }
    ),
    LanguageEditorialStatus.APPROVED: frozenset(
        {
            LanguageEditorialStatus.PUBLISHED,
            LanguageEditorialStatus.DRAFT,
        }
    ),
    LanguageEditorialStatus.PUBLISHED: frozenset(
        {
            LanguageEditorialStatus.DRAFT,
            LanguageEditorialStatus.WITHDRAWN,
        }
    ),
}


def submission_allows(from_status: WorkflowStatus, to_status: WorkflowStatus) -> bool:
    return to_status in SUBMISSION_TRANSITIONS.get(from_status, frozenset())


def investigation_allows(from_status: WorkflowStatus, to_status: WorkflowStatus) -> bool:
    if from_status == WorkflowStatus.ON_HOLD:
        return to_status in INVESTIGATION_TRANSITIONS[WorkflowStatus.ON_HOLD]
    return to_status in INVESTIGATION_TRANSITIONS.get(from_status, frozenset())


def language_content_allows(
    from_status: LanguageEditorialStatus,
    to_status: LanguageEditorialStatus,
) -> bool:
    return to_status in LANGUAGE_CONTENT_TRANSITIONS.get(from_status, frozenset())


def all_submission_pairs() -> frozenset[tuple[WorkflowStatus, WorkflowStatus]]:
    pairs: set[tuple[WorkflowStatus, WorkflowStatus]] = set()
    for from_status, targets in SUBMISSION_TRANSITIONS.items():
        for to_status in targets:
            pairs.add((from_status, to_status))
    return frozenset(pairs)


def all_investigation_pairs() -> frozenset[tuple[WorkflowStatus, WorkflowStatus]]:
    pairs: set[tuple[WorkflowStatus, WorkflowStatus]] = set()
    for from_status, targets in INVESTIGATION_TRANSITIONS.items():
        for to_status in targets:
            pairs.add((from_status, to_status))
    return frozenset(pairs)


def all_language_content_pairs() -> frozenset[
    tuple[LanguageEditorialStatus, LanguageEditorialStatus]
]:
    pairs: set[tuple[LanguageEditorialStatus, LanguageEditorialStatus]] = set()
    for from_status, targets in LANGUAGE_CONTENT_TRANSITIONS.items():
        for to_status in targets:
            pairs.add((from_status, to_status))
    return frozenset(pairs)
