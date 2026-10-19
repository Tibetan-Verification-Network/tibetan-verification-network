"""Staff account administration."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.enums import RoleCode
from app.models.identity import User, UserRole
from app.services.audit import AuditEventType, record_audit_event
from app.services.auth import revoke_all_user_sessions
from app.services.invites import load_roles_by_codes


async def get_user_with_roles(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.roles).selectinload(UserRole.role))
    )
    return result.scalar_one_or_none()


async def disable_user(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    actor_user_id: uuid.UUID,
) -> User | None:
    user = await get_user_with_roles(db, user_id)
    if user is None:
        return None
    if user.disabled_at is not None:
        return user
    now = datetime.now(tz=UTC)
    user.is_active = False
    user.disabled_at = now
    user.updated_by_id = actor_user_id
    await revoke_all_user_sessions(
        db,
        user_id=user.id,
        actor_user_id=actor_user_id,
        reason="account_disabled",
    )
    await record_audit_event(
        db,
        event_type=AuditEventType.USER_DISABLED,
        actor_user_id=actor_user_id,
        subject_type="user",
        subject_id=user.id,
    )
    await db.flush()
    return user


async def replace_user_roles(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    role_codes: list[RoleCode],
    actor_user_id: uuid.UUID,
) -> User | None:
    user = await get_user_with_roles(db, user_id)
    if user is None:
        return None
    roles = await load_roles_by_codes(db, role_codes)
    await db.execute(delete(UserRole).where(UserRole.user_id == user.id))
    db.add_all(
        [UserRole(user_id=user.id, role_id=role.id, assigned_by_id=actor_user_id) for role in roles]
    )
    user.updated_by_id = actor_user_id
    await record_audit_event(
        db,
        event_type=AuditEventType.USER_ROLES_UPDATED,
        actor_user_id=actor_user_id,
        subject_type="user",
        subject_id=user.id,
        payload={"role_codes": [code.value for code in role_codes]},
    )
    await db.flush()
    await db.refresh(user, attribute_names=["roles"])
    return user
