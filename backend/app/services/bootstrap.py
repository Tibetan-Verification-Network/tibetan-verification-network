"""One-time platform administrator bootstrap."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import hash_password, normalize_email
from app.db.enums import RoleCode
from app.models.identity import Role, User, UserRole
from app.services.audit import AuditEventType, record_audit_event


@dataclass(frozen=True, slots=True)
class BootstrapResult:
    user: User
    created: bool


async def platform_admin_exists(db: AsyncSession) -> bool:
    result = await db.execute(
        select(func.count())
        .select_from(UserRole)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.code == RoleCode.PLATFORM_ADMINISTRATOR)
    )
    count = result.scalar_one()
    return count > 0


async def bootstrap_platform_admin(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    display_name: str | None = None,
) -> BootstrapResult:
    if await platform_admin_exists(db):
        raise RuntimeError("A platform administrator already exists")

    normalized = normalize_email(email)
    existing = await db.scalar(select(User.id).where(User.email_normalized == normalized))
    if existing is not None:
        raise RuntimeError("A user with this email already exists")

    admin_role = await db.scalar(select(Role).where(Role.code == RoleCode.PLATFORM_ADMINISTRATOR))
    if admin_role is None:
        raise RuntimeError("Platform administrator role is missing; run migrations first")

    user = User(
        email=email.strip(),
        email_normalized=normalized,
        display_name=display_name,
        password_hash=hash_password(password),
        is_active=True,
    )
    db.add(user)
    await db.flush()
    db.add(UserRole(user_id=user.id, role_id=admin_role.id))
    await record_audit_event(
        db,
        event_type=AuditEventType.BOOTSTRAP_ADMIN,
        actor_user_id=user.id,
        subject_type="user",
        subject_id=user.id,
        payload={"email_normalized": normalized},
    )
    await db.flush()
    loaded = await db.scalar(
        select(User)
        .where(User.id == user.id)
        .options(selectinload(User.roles).selectinload(UserRole.role))
    )
    assert loaded is not None
    return BootstrapResult(user=loaded, created=True)
