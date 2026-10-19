"""Staff invite creation and activation."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.security import (
    generate_opaque_token,
    hash_opaque_token,
    hash_password,
    normalize_email,
)
from app.db.enums import RoleCode
from app.models.identity import Role, StaffInvite, StaffInviteRole, User, UserRole
from app.services.audit import AuditEventType, record_audit_event


@dataclass(frozen=True, slots=True)
class CreatedInvite:
    invite: StaffInvite
    raw_token: str


@dataclass(frozen=True, slots=True)
class ActivationResult:
    user: User


def invite_expiry(settings: Settings) -> datetime:
    return datetime.now(tz=UTC) + timedelta(hours=settings.invite_ttl_hours)


async def load_roles_by_codes(db: AsyncSession, role_codes: list[RoleCode]) -> list[Role]:
    if not role_codes:
        raise ValueError("At least one role is required")
    result = await db.execute(select(Role).where(Role.code.in_(role_codes)))
    roles = list(result.scalars().all())
    found = {role.code for role in roles}
    missing = [code.value for code in role_codes if code not in found]
    if missing:
        raise ValueError(f"Unknown roles: {', '.join(missing)}")
    return roles


async def create_staff_invite(
    db: AsyncSession,
    *,
    email: str,
    role_codes: list[RoleCode],
    invited_by_id: uuid.UUID,
    settings: Settings,
) -> CreatedInvite:
    normalized = normalize_email(email)
    existing_user = await db.scalar(select(User.id).where(User.email_normalized == normalized))
    if existing_user is not None:
        raise ValueError("A user with this email already exists")

    raw_token = generate_opaque_token()
    invite = StaffInvite(
        email=email.strip(),
        email_normalized=normalized,
        token_hash=hash_opaque_token(raw_token),
        expires_at=invite_expiry(settings),
        invited_by_id=invited_by_id,
    )
    db.add(invite)
    await db.flush()

    roles = await load_roles_by_codes(db, role_codes)
    db.add_all([StaffInviteRole(invite_id=invite.id, role_id=role.id) for role in roles])
    await record_audit_event(
        db,
        event_type=AuditEventType.INVITE_CREATED,
        actor_user_id=invited_by_id,
        subject_type="staff_invite",
        subject_id=invite.id,
        payload={"email_normalized": normalized, "role_codes": [code.value for code in role_codes]},
    )
    await db.flush()
    return CreatedInvite(invite=invite, raw_token=raw_token)


async def activate_staff_invite(
    db: AsyncSession,
    *,
    raw_token: str,
    password: str,
    display_name: str | None,
) -> tuple[ActivationResult | None, str | None]:
    token_hash = hash_opaque_token(raw_token)
    result = await db.execute(
        select(StaffInvite)
        .where(StaffInvite.token_hash == token_hash)
        .options(selectinload(StaffInvite.role_links).selectinload(StaffInviteRole.role))
    )
    invite = result.scalar_one_or_none()
    now = datetime.now(tz=UTC)
    if invite is None:
        await record_audit_event(
            db,
            event_type=AuditEventType.INVITE_FAILED,
            payload={"reason": "invalid_token"},
        )
        return None, "Invalid or expired invite"
    if invite.revoked_at is not None or invite.consumed_at is not None or invite.expires_at <= now:
        await record_audit_event(
            db,
            event_type=AuditEventType.INVITE_FAILED,
            subject_type="staff_invite",
            subject_id=invite.id,
            payload={"reason": "expired_or_used"},
        )
        return None, "Invalid or expired invite"

    existing = await db.scalar(
        select(User.id).where(User.email_normalized == invite.email_normalized)
    )
    if existing is not None:
        await record_audit_event(
            db,
            event_type=AuditEventType.INVITE_FAILED,
            subject_type="staff_invite",
            subject_id=invite.id,
            payload={"reason": "email_taken"},
        )
        return None, "Invalid or expired invite"

    user = User(
        email=invite.email,
        email_normalized=invite.email_normalized,
        display_name=display_name,
        password_hash=hash_password(password),
        is_active=True,
        created_by_id=invite.invited_by_id,
    )
    db.add(user)
    await db.flush()

    for link in invite.role_links:
        db.add(
            UserRole(
                user_id=user.id,
                role_id=link.role_id,
                assigned_by_id=invite.invited_by_id,
            )
        )
    invite.consumed_at = now
    await record_audit_event(
        db,
        event_type=AuditEventType.INVITE_ACCEPTED,
        actor_user_id=user.id,
        subject_type="staff_invite",
        subject_id=invite.id,
        payload={"email_normalized": invite.email_normalized},
    )
    await db.flush()
    loaded = await db.scalar(
        select(User)
        .where(User.id == user.id)
        .options(selectinload(User.roles).selectinload(UserRole.role))
    )
    assert loaded is not None
    return ActivationResult(user=loaded), None
