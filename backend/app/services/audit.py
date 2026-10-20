"""Append-only audit events with safe payloads."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditEvent

SENSITIVE_PAYLOAD_KEYS = frozenset(
    {
        "password",
        "password_hash",
        "token",
        "raw_token",
        "session_token",
        "csrf_token",
        "cookie",
        "authorization",
        "contact_email",
        "contact_phone",
        "contact_name",
    }
)


class AuditEventType:
    BOOTSTRAP_ADMIN = "bootstrap.admin_created"
    INVITE_CREATED = "staff_invite.created"
    INVITE_ACCEPTED = "staff_invite.accepted"
    INVITE_FAILED = "staff_invite.failed"
    LOGIN_SUCCEEDED = "auth.login_succeeded"
    LOGIN_FAILED = "auth.login_failed"
    LOGOUT = "auth.logout"
    SESSION_REVOKED = "auth.session_revoked"
    USER_DISABLED = "user.disabled"
    USER_ROLES_UPDATED = "user.roles_updated"
    SUBMISSION_TRIAGED = "submission.triaged"
    SUBMISSION_MERGED = "submission.merged"
    INVESTIGATION_ASSIGNED = "investigation.assigned"
    INVESTIGATION_UNASSIGNED = "investigation.unassigned"
    INVESTIGATION_CREATED = "investigation.created"
    INVESTIGATION_STATUS_CHANGED = "investigation.status_changed"
    SOURCE_DELETED = "source.deleted"
    EVIDENCE_DELETED = "evidence.deleted"
    SUBMISSION_CONTACT_VIEWED = "submission.contact_viewed"
    ARCHIVE_UPLOADED = "archive.uploaded"
    ARCHIVE_RECLASSIFIED = "archive.reclassified"
    ARCHIVE_GRANT_CREATED = "archive.grant_created"
    ARCHIVE_GRANT_REVOKED = "archive.grant_revoked"
    ARCHIVE_RESTRICTED_ACCESS_LINK = "archive.restricted_access_link"
    WORKFLOW_TRANSITION = "workflow.transition"
    FACTCHECK_CREATED = "factcheck.created"
    DRAFT_REVISION_SAVED = "draft.revision_saved"
    DRAFT_SUBMITTED_FOR_REVIEW = "draft.submitted_for_review"
    REVIEW_COMMENTED = "review.commented"
    REVIEW_CHANGES_REQUESTED = "review.changes_requested"
    REVIEW_MARKED_READY = "review.marked_ready"
    REVIEW_APPROVED = "review.approved"
    REVIEW_REOPENED = "review.reopened"
    REVIEW_INVALIDATED = "review.invalidated"
    READINESS_BLOCKED = "readiness.blocked"
    EVIDENCE_VERIFIED = "evidence.verified"
    EVIDENCE_VERIFICATION_CLEARED = "evidence.verification_cleared"
    FACTCHECK_PUBLISHED = "factcheck.published"
    FACTCHECK_CORRECTION_STARTED = "factcheck.correction_started"
    FACTCHECK_WITHDRAWN = "factcheck.withdrawn"
    TOPIC_CREATED = "topic.created"
    TOPIC_UPDATED = "topic.updated"
    FACTCHECK_TOPICS_UPDATED = "factcheck.topics_updated"


def sanitize_payload(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    if not payload:
        return None
    cleaned: dict[str, Any] = {}
    for key, value in payload.items():
        if key.lower() in SENSITIVE_PAYLOAD_KEYS:
            continue
        cleaned[key] = value
    return cleaned or None


async def record_audit_event(
    session: AsyncSession,
    *,
    event_type: str,
    actor_user_id: uuid.UUID | None = None,
    subject_type: str | None = None,
    subject_id: uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> AuditEvent:
    event = AuditEvent(
        event_type=event_type,
        actor_user_id=actor_user_id,
        subject_type=subject_type,
        subject_id=subject_id,
        payload=sanitize_payload(payload),
    )
    session.add(event)
    await session.flush()
    return event
