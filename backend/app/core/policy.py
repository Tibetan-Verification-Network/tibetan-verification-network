"""Object-level authorization for editorial, research, and archive resources."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import Select, false, or_, select
from sqlalchemy.sql import ColumnElement

from app.db.enums import ArchiveVisibility, LanguageEditorialStatus, RoleCode
from app.models.archive import AccessGrant, ArchiveDocument
from app.models.assignments import InvestigationAssignment
from app.models.identity import User
from app.models.intake import Submission
from app.models.publication import FactCheck, FactCheckContent
from app.models.research import Investigation

EDITORIAL_ROLES = frozenset(
    {
        RoleCode.RESEARCHER,
        RoleCode.EDITOR,
        RoleCode.APPROVER,
    }
)

INVESTIGATION_WRITE_ROLES = frozenset({RoleCode.RESEARCHER, RoleCode.EDITOR})


class Action(StrEnum):
    SUBMISSION_LIST = "submission.list"
    SUBMISSION_TRIAGE = "submission.triage"
    SUBMISSION_CONTACT_VIEW = "submission.contact_view"
    INVESTIGATION_CREATE = "investigation.create"
    INVESTIGATION_LIST = "investigation.list"
    INVESTIGATION_VIEW = "investigation.view"
    INVESTIGATION_EDIT = "investigation.edit"
    INVESTIGATION_ASSIGN = "investigation.assign"
    EVIDENCE_WRITE = "evidence.write"
    ARCHIVE_UPLOAD = "archive.upload"
    ARCHIVE_VIEW_METADATA = "archive.view_metadata"
    ARCHIVE_DOWNLOAD = "archive.download"
    ARCHIVE_RECLASSIFY = "archive.reclassify"
    ARCHIVE_GRANT = "archive.grant"
    FACTCHECK_CREATE = "factcheck.create"
    FACTCHECK_VIEW = "factcheck.view"
    DRAFT_EDIT = "draft.edit"
    DRAFT_SUBMIT = "draft.submit"
    REVIEW_COMMENT = "review.comment"
    REVIEW_REQUEST_CHANGES = "review.request_changes"
    REVIEW_MARK_READY = "review.mark_ready"
    APPROVE = "factcheck.approve"
    PUBLISH = "factcheck.publish"
    CORRECTION_START = "factcheck.correction_start"
    WITHDRAW = "factcheck.withdraw"
    AUDIT_VIEW = "audit.view"


def _role_codes(user: User) -> set[RoleCode]:
    return {assignment.role.code for assignment in user.roles}


def has_editorial_role(user: User) -> bool:
    return bool(_role_codes(user).intersection(EDITORIAL_ROLES))


def is_editor(user: User) -> bool:
    return RoleCode.EDITOR in _role_codes(user)


def is_researcher(user: User) -> bool:
    return RoleCode.RESEARCHER in _role_codes(user)


def is_approver(user: User) -> bool:
    return RoleCode.APPROVER in _role_codes(user)


def is_platform_admin_only(user: User) -> bool:
    codes = _role_codes(user)
    return RoleCode.PLATFORM_ADMINISTRATOR in codes and codes.isdisjoint(EDITORIAL_ROLES)


def _active_assignment_exists(user: User, investigation: Investigation) -> bool:
    if investigation.owner_id == user.id:
        return True
    for assignment in investigation.assignments:
        if assignment.user_id == user.id and assignment.removed_at is None:
            return True
    return False


def _has_active_grant(
    user_id: uuid.UUID,
    document: ArchiveDocument,
    *,
    now: datetime | None = None,
) -> bool:
    moment = now or datetime.now(UTC)
    for grant in document.access_grants:
        if grant.user_id != user_id or grant.revoked_at is not None:
            continue
        if grant.expires_at is not None and grant.expires_at <= moment:
            continue
        return True
    return False


def _restricted_document_allowed(
    user: User,
    document: ArchiveDocument,
    *,
    now: datetime | None = None,
) -> bool:
    if document.visibility != ArchiveVisibility.RESTRICTED:
        return True
    return _has_active_grant(user.id, document, now=now)


def _investigation_write_allowed(user: User, investigation: Investigation) -> bool:
    if is_editor(user):
        return True
    return is_researcher(user) and _active_assignment_exists(user, investigation)


def _investigation_view_allowed(user: User, investigation: Investigation) -> bool:
    if is_editor(user):
        return True
    assigned = _active_assignment_exists(user, investigation)
    return (is_researcher(user) or is_approver(user)) and assigned


def _archive_investigation_allowed(user: User, document: ArchiveDocument) -> bool:
    investigation = document.investigation
    if investigation is None:
        return False
    if document.visibility == ArchiveVisibility.INTERNAL:
        return _investigation_write_allowed(user, investigation) or (
            is_approver(user) and _active_assignment_exists(user, investigation)
        )
    if document.visibility == ArchiveVisibility.RESTRICTED:
        if not _restricted_document_allowed(user, document):
            return False
        return _investigation_view_allowed(user, investigation)
    return _investigation_view_allowed(user, investigation)


def can(
    user: User,
    action: Action,
    obj: Any | None = None,
    *,
    now: datetime | None = None,
) -> bool:
    """Return whether ``user`` may perform ``action`` on optional ``obj``."""
    if is_platform_admin_only(user):
        return False

    if action in {Action.SUBMISSION_LIST, Action.SUBMISSION_TRIAGE}:
        return is_researcher(user) or is_editor(user)

    if action == Action.SUBMISSION_CONTACT_VIEW:
        if isinstance(obj, Submission):
            return is_editor(user)
        return is_editor(user)

    if action == Action.INVESTIGATION_CREATE:
        return is_researcher(user) or is_editor(user)

    if action == Action.INVESTIGATION_LIST:
        return has_editorial_role(user)

    if action in {
        Action.INVESTIGATION_VIEW,
        Action.INVESTIGATION_EDIT,
        Action.INVESTIGATION_ASSIGN,
        Action.EVIDENCE_WRITE,
    }:
        if not isinstance(obj, Investigation):
            return False
        if action == Action.INVESTIGATION_ASSIGN:
            return is_editor(user)
        if action == Action.INVESTIGATION_VIEW:
            return _investigation_view_allowed(user, obj)
        if action in {Action.INVESTIGATION_EDIT, Action.EVIDENCE_WRITE}:
            return _investigation_write_allowed(user, obj)

    if action == Action.ARCHIVE_UPLOAD and isinstance(obj, Investigation):
        return _investigation_write_allowed(user, obj)

    if action in {
        Action.ARCHIVE_UPLOAD,
        Action.ARCHIVE_VIEW_METADATA,
        Action.ARCHIVE_DOWNLOAD,
        Action.ARCHIVE_RECLASSIFY,
        Action.ARCHIVE_GRANT,
    }:
        if not isinstance(obj, ArchiveDocument):
            return False
        if action == Action.ARCHIVE_RECLASSIFY:
            return is_editor(user)
        if action == Action.ARCHIVE_GRANT:
            if not is_editor(user):
                return False
            if obj.visibility != ArchiveVisibility.RESTRICTED:
                return False
            return _has_active_grant(user.id, obj, now=now)
        if action == Action.ARCHIVE_UPLOAD:
            investigation = obj.investigation
            if investigation is None:
                return False
            return _investigation_write_allowed(user, investigation)
        if action == Action.ARCHIVE_DOWNLOAD:
            if not _archive_investigation_allowed(user, obj):
                return False
            return _restricted_document_allowed(user, obj, now=now)
        if action == Action.ARCHIVE_VIEW_METADATA:
            if not _archive_investigation_allowed(user, obj):
                return False
            return _restricted_document_allowed(user, obj, now=now)

    if action == Action.FACTCHECK_CREATE:
        if isinstance(obj, Investigation):
            return _investigation_write_allowed(user, obj)
        return is_researcher(user) or is_editor(user)

    if action == Action.FACTCHECK_VIEW and obj is None:
        return has_editorial_role(user)

    if action == Action.APPROVE and obj is None:
        return is_approver(user)

    if action in {
        Action.FACTCHECK_VIEW,
        Action.DRAFT_EDIT,
        Action.DRAFT_SUBMIT,
        Action.REVIEW_COMMENT,
        Action.REVIEW_REQUEST_CHANGES,
        Action.REVIEW_MARK_READY,
        Action.APPROVE,
        Action.PUBLISH,
        Action.CORRECTION_START,
        Action.WITHDRAW,
    }:
        if not isinstance(obj, FactCheck):
            return False
        investigation = obj.investigation
        if investigation is None:
            return False
        if action == Action.FACTCHECK_VIEW:
            return _factcheck_view_allowed(user, obj)
        if action in {Action.DRAFT_EDIT, Action.DRAFT_SUBMIT}:
            return _investigation_write_allowed(user, investigation)
        if action == Action.REVIEW_REQUEST_CHANGES:
            return (is_editor(user) or is_approver(user)) and _factcheck_view_allowed(user, obj)
        if action in {Action.REVIEW_COMMENT, Action.REVIEW_MARK_READY}:
            return is_editor(user) and _factcheck_view_allowed(user, obj)
        if action in {
            Action.APPROVE,
            Action.PUBLISH,
            Action.CORRECTION_START,
            Action.WITHDRAW,
        }:
            return is_approver(user) and _factcheck_view_allowed(user, obj)

    if action == Action.AUDIT_VIEW:
        return is_editor(user) or is_approver(user)

    return False  # type: ignore[unreachable]


def _factcheck_in_approval_queue(fact_check: FactCheck) -> bool:
    return any(
        content.editorial_status
        in {LanguageEditorialStatus.READY_FOR_APPROVAL, LanguageEditorialStatus.APPROVED}
        for content in fact_check.contents
    )


def _factcheck_view_allowed(user: User, fact_check: FactCheck) -> bool:
    investigation = fact_check.investigation
    if investigation is None:
        return False
    if _investigation_view_allowed(user, investigation):
        return True
    return is_approver(user) and _factcheck_in_approval_queue(fact_check)


def scope_investigations(
    stmt: Select[tuple[Investigation]],
    user: User,
) -> Select[tuple[Investigation]]:
    """Restrict an investigation query to rows visible to ``user``."""
    if is_platform_admin_only(user) or not has_editorial_role(user):
        return stmt.where(false())

    if is_editor(user):
        return stmt

    assigned_ids = (
        select(InvestigationAssignment.investigation_id)
        .where(
            InvestigationAssignment.user_id == user.id,
            InvestigationAssignment.removed_at.is_(None),
        )
        .scalar_subquery()
    )
    return stmt.where(
        or_(
            Investigation.owner_id == user.id,
            Investigation.id.in_(assigned_ids),
        )
    )


def _active_grant_exists_clause(user_id: uuid.UUID) -> ColumnElement[bool]:
    active_grants = (
        select(AccessGrant.archive_document_id)
        .where(
            AccessGrant.user_id == user_id,
            AccessGrant.revoked_at.is_(None),
            or_(
                AccessGrant.expires_at.is_(None),
                AccessGrant.expires_at > datetime.now(UTC),
            ),
        )
        .scalar_subquery()
    )
    return ArchiveDocument.id.in_(active_grants)


def scope_archive_documents(
    stmt: Select[tuple[ArchiveDocument]],
    user: User,
) -> Select[tuple[ArchiveDocument]]:
    """Restrict an archive document query to metadata visible to ``user``."""
    if is_platform_admin_only(user) or not has_editorial_role(user):
        return stmt.where(false())

    visible_investigation_ids = (
        scope_investigations(select(Investigation), user)
        .with_only_columns(Investigation.id)
        .scalar_subquery()
    )
    stmt = stmt.where(ArchiveDocument.investigation_id.in_(visible_investigation_ids))

    return stmt.where(
        or_(
            ArchiveDocument.visibility != ArchiveVisibility.RESTRICTED,
            _active_grant_exists_clause(user.id),
        )
    )


def scope_submissions(stmt: Select[tuple[Submission]], user: User) -> Select[tuple[Submission]]:
    """Restrict submission queries to editorial staff who may triage."""
    if can(user, Action.SUBMISSION_LIST):
        return stmt
    return stmt.where(false())


def scope_factchecks(
    stmt: Select[tuple[FactCheck]],
    user: User,
) -> Select[tuple[FactCheck]]:
    """Restrict fact-check queries to investigations visible to ``user``."""
    if is_platform_admin_only(user) or not has_editorial_role(user):
        return stmt.where(false())

    visible_investigation_ids = (
        scope_investigations(select(Investigation), user)
        .with_only_columns(Investigation.id)
        .scalar_subquery()
    )
    visibility_clauses: list[ColumnElement[bool]] = [
        FactCheck.investigation_id.in_(visible_investigation_ids)
    ]
    if is_approver(user):
        approval_queue_ids = (
            select(FactCheckContent.fact_check_id)
            .where(
                FactCheckContent.editorial_status.in_(
                    (
                        LanguageEditorialStatus.READY_FOR_APPROVAL,
                        LanguageEditorialStatus.APPROVED,
                    )
                )
            )
            .scalar_subquery()
        )
        visibility_clauses.append(FactCheck.id.in_(approval_queue_ids))
    return stmt.where(or_(*visibility_clauses))
