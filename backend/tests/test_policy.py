"""Unit tests for the central access policy matrix."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.policy import Action, can
from app.db.enums import (
    ArchiveVisibility,
    InvestigationAssignmentRole,
    LanguageCode,
    LanguageEditorialStatus,
    RoleCode,
    WorkflowStatus,
)
from app.models.publication import FactCheck, FactCheckContent
from tests.factories import make_document, make_investigation, make_submission, make_user

pytestmark = pytest.mark.usefixtures("db_session")


async def test_platform_admin_without_editorial_role_is_denied(db_session: AsyncSession) -> None:
    admin = await make_user(db_session, roles=(RoleCode.PLATFORM_ADMINISTRATOR,))
    submission = await make_submission(db_session)
    investigation = await make_investigation(db_session)
    document = await make_document(db_session, investigation=investigation)

    fact_check = FactCheck(
        investigation_id=investigation.id,
        workflow_status=WorkflowStatus.DRAFTING,
    )
    fact_check.contents = [
        FactCheckContent(
            language=LanguageCode.EN,
            editorial_status=LanguageEditorialStatus.READY_FOR_APPROVAL,
        )
    ]

    for action in Action:
        obj = None
        if action.value.startswith("submission."):
            obj = submission
        elif action.value.startswith("investigation.") or action.value.startswith("evidence."):
            obj = investigation
        elif action.value.startswith("archive."):
            obj = document
        elif (
            action.value.startswith("factcheck.")
            or action.value.startswith("draft.")
            or action.value.startswith("review.")
        ):
            obj = fact_check
        assert can(admin, action, obj) is False


@pytest.mark.parametrize(
    ("action", "expected"),
    [
        (Action.SUBMISSION_LIST, True),
        (Action.SUBMISSION_TRIAGE, True),
        (Action.SUBMISSION_CONTACT_VIEW, False),
        (Action.INVESTIGATION_CREATE, True),
        (Action.INVESTIGATION_LIST, True),
        (Action.INVESTIGATION_ASSIGN, False),
        (Action.ARCHIVE_RECLASSIFY, False),
        (Action.ARCHIVE_GRANT, False),
    ],
)
async def test_researcher_global_actions(
    db_session: AsyncSession,
    action: Action,
    expected: bool,
) -> None:
    researcher = await make_user(db_session, roles=(RoleCode.RESEARCHER,))
    assert can(researcher, action) is expected


async def test_researcher_investigation_access_is_assignment_scoped(
    db_session: AsyncSession,
) -> None:
    researcher = await make_user(db_session, roles=(RoleCode.RESEARCHER,))
    other = await make_user(db_session, email="other@example.org", roles=(RoleCode.RESEARCHER,))
    assigned = await make_investigation(
        db_session,
        owner=other,
        assigned=[(researcher, InvestigationAssignmentRole.CONTRIBUTOR)],
    )
    foreign = await make_investigation(db_session, owner=other)

    assert can(researcher, Action.INVESTIGATION_VIEW, assigned) is True
    assert can(researcher, Action.INVESTIGATION_EDIT, assigned) is True
    assert can(researcher, Action.EVIDENCE_WRITE, assigned) is True
    assert can(researcher, Action.INVESTIGATION_VIEW, foreign) is False


async def test_editor_has_full_investigation_access(db_session: AsyncSession) -> None:
    editor = await make_user(db_session, roles=(RoleCode.EDITOR,))
    owner = await make_user(db_session, email="owner@example.org", roles=(RoleCode.RESEARCHER,))
    investigation = await make_investigation(db_session, owner=owner)

    assert can(editor, Action.INVESTIGATION_VIEW, investigation) is True
    assert can(editor, Action.INVESTIGATION_EDIT, investigation) is True
    assert can(editor, Action.INVESTIGATION_ASSIGN, investigation) is True
    assert can(editor, Action.SUBMISSION_CONTACT_VIEW) is True


async def test_approver_is_read_only_on_assigned_investigations(db_session: AsyncSession) -> None:
    approver = await make_user(db_session, roles=(RoleCode.APPROVER,))
    owner = await make_user(db_session, email="owner@example.org", roles=(RoleCode.RESEARCHER,))
    investigation = await make_investigation(
        db_session,
        owner=owner,
        assigned=[(approver, InvestigationAssignmentRole.CONTRIBUTOR)],
    )

    assert can(approver, Action.INVESTIGATION_VIEW, investigation) is True
    assert can(approver, Action.INVESTIGATION_EDIT, investigation) is False
    assert can(approver, Action.EVIDENCE_WRITE, investigation) is False


async def test_restricted_archive_requires_active_grant(db_session: AsyncSession) -> None:
    editor = await make_user(db_session, roles=(RoleCode.EDITOR,))
    researcher = await make_user(
        db_session,
        email="assigned@example.org",
        roles=(RoleCode.RESEARCHER,),
    )
    investigation = await make_investigation(
        db_session,
        owner=editor,
        assigned=[(researcher, InvestigationAssignmentRole.CONTRIBUTOR)],
    )
    restricted = await make_document(
        db_session,
        investigation=investigation,
        visibility=ArchiveVisibility.RESTRICTED,
        grant_to=(editor,),
    )

    assert can(researcher, Action.ARCHIVE_VIEW_METADATA, restricted) is False
    assert can(editor, Action.ARCHIVE_VIEW_METADATA, restricted) is True
    assert can(editor, Action.ARCHIVE_DOWNLOAD, restricted) is True
    assert can(editor, Action.ARCHIVE_GRANT, restricted) is True


async def test_expired_grant_denies_restricted_access(db_session: AsyncSession) -> None:
    editor = await make_user(db_session, roles=(RoleCode.EDITOR,))
    investigation = await make_investigation(db_session, owner=editor)
    document = await make_document(
        db_session,
        investigation=investigation,
        visibility=ArchiveVisibility.RESTRICTED,
        grant_to=(editor,),
    )
    document.access_grants[0].expires_at = datetime.now(UTC) - timedelta(minutes=1)
    assert can(editor, Action.ARCHIVE_DOWNLOAD, document) is False


async def test_internal_archive_follows_investigation_membership(db_session: AsyncSession) -> None:
    researcher = await make_user(db_session, roles=(RoleCode.RESEARCHER,))
    owner = await make_user(db_session, email="owner@example.org", roles=(RoleCode.RESEARCHER,))
    assigned = await make_investigation(
        db_session,
        owner=owner,
        assigned=[(researcher, InvestigationAssignmentRole.CONTRIBUTOR)],
    )
    foreign = await make_investigation(db_session, owner=owner)
    assigned_doc = await make_document(db_session, investigation=assigned)
    foreign_doc = await make_document(db_session, investigation=foreign)

    assert can(researcher, Action.ARCHIVE_UPLOAD, assigned_doc) is True
    assert can(researcher, Action.ARCHIVE_VIEW_METADATA, assigned_doc) is True
    assert can(researcher, Action.ARCHIVE_VIEW_METADATA, foreign_doc) is False
