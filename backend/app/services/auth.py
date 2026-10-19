"""Session lifecycle, login, logout, and CSRF helpers."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.security import (
    GENERIC_AUTH_FAILURE,
    digest_matches,
    generate_opaque_token,
    hash_opaque_token,
    hash_password,
    normalize_email,
    password_needs_rehash,
    verify_password,
)
from app.models.identity import AuthSession, User, UserRole
from app.services.audit import AuditEventType, record_audit_event


@dataclass(frozen=True, slots=True)
class SessionBundle:
    session: AuthSession
    raw_session_token: str
    raw_csrf_token: str


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    user: User
    session: AuthSession


def session_expiry(settings: Settings) -> datetime:
    return datetime.now(tz=UTC) + timedelta(hours=settings.session_ttl_hours)


async def load_user_by_email(session: AsyncSession, email: str) -> User | None:
    normalized = normalize_email(email)
    result = await session.execute(
        select(User)
        .where(User.email_normalized == normalized)
        .options(selectinload(User.roles).selectinload(UserRole.role))
    )
    return result.scalar_one_or_none()


async def create_session(
    db: AsyncSession,
    *,
    user: User,
    settings: Settings,
) -> SessionBundle:
    raw_session_token = generate_opaque_token()
    raw_csrf_token = generate_opaque_token()
    auth_session = AuthSession(
        user_id=user.id,
        session_token_hash=hash_opaque_token(raw_session_token),
        csrf_token_hash=hash_opaque_token(raw_csrf_token),
        expires_at=session_expiry(settings),
        last_seen_at=datetime.now(tz=UTC),
    )
    db.add(auth_session)
    await db.flush()
    return SessionBundle(
        session=auth_session,
        raw_session_token=raw_session_token,
        raw_csrf_token=raw_csrf_token,
    )


async def authenticate_session(
    db: AsyncSession,
    *,
    raw_session_token: str | None,
) -> AuthenticatedUser | None:
    if not raw_session_token:
        return None
    token_hash = hash_opaque_token(raw_session_token)
    result = await db.execute(
        select(AuthSession)
        .where(AuthSession.session_token_hash == token_hash)
        .options(
            selectinload(AuthSession.user).selectinload(User.roles).selectinload(UserRole.role),
        )
    )
    auth_session = result.scalar_one_or_none()
    if auth_session is None:
        return None
    now = datetime.now(tz=UTC)
    if auth_session.revoked_at is not None or auth_session.expires_at <= now:
        return None
    user = auth_session.user
    if not user.is_active or user.disabled_at is not None:
        return None
    auth_session.last_seen_at = now
    await db.flush()
    return AuthenticatedUser(user=user, session=auth_session)


def csrf_is_valid(auth_session: AuthSession, raw_csrf_token: str | None) -> bool:
    if not raw_csrf_token or auth_session.csrf_token_hash is None:
        return False
    return digest_matches(auth_session.csrf_token_hash, raw_csrf_token)


async def login_with_password(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    settings: Settings,
) -> tuple[SessionBundle | None, str | None]:
    user = await load_user_by_email(db, email)
    if user is None or user.password_hash is None:
        await record_audit_event(
            db,
            event_type=AuditEventType.LOGIN_FAILED,
            payload={"reason": "invalid_credentials"},
        )
        return None, GENERIC_AUTH_FAILURE
    if not user.is_active or user.disabled_at is not None:
        await record_audit_event(
            db,
            event_type=AuditEventType.LOGIN_FAILED,
            subject_type="user",
            subject_id=user.id,
            payload={"reason": "inactive_account"},
        )
        return None, GENERIC_AUTH_FAILURE
    if not verify_password(user.password_hash, password):
        await record_audit_event(
            db,
            event_type=AuditEventType.LOGIN_FAILED,
            subject_type="user",
            subject_id=user.id,
            payload={"reason": "invalid_credentials"},
        )
        return None, GENERIC_AUTH_FAILURE
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    bundle = await create_session(db, user=user, settings=settings)
    await record_audit_event(
        db,
        event_type=AuditEventType.LOGIN_SUCCEEDED,
        actor_user_id=user.id,
        subject_type="auth_session",
        subject_id=bundle.session.id,
    )
    return bundle, None


async def revoke_session(
    db: AsyncSession,
    *,
    auth_session: AuthSession,
    actor_user_id: uuid.UUID | None,
    reason: str,
) -> None:
    if auth_session.revoked_at is not None:
        return
    auth_session.revoked_at = datetime.now(tz=UTC)
    await record_audit_event(
        db,
        event_type=AuditEventType.SESSION_REVOKED,
        actor_user_id=actor_user_id,
        subject_type="auth_session",
        subject_id=auth_session.id,
        payload={"reason": reason},
    )
    await db.flush()


async def revoke_all_user_sessions(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    actor_user_id: uuid.UUID | None,
    reason: str,
) -> None:
    now = datetime.now(tz=UTC)
    await db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await record_audit_event(
        db,
        event_type=AuditEventType.SESSION_REVOKED,
        actor_user_id=actor_user_id,
        subject_type="user",
        subject_id=user_id,
        payload={"reason": reason, "scope": "all_sessions"},
    )
