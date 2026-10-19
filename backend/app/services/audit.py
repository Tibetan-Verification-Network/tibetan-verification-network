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
