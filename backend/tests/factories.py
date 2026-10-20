"""Test data builders for editorial and research objects."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.db.enums import (
    ArchiveUploadStatus,
    ArchiveVisibility,
    InvestigationAssignmentRole,
    RoleCode,
    WorkflowStatus,
)
from app.models.archive import AccessGrant, ArchiveDocument
from app.models.assignments import InvestigationAssignment
from app.models.identity import Role, User, UserRole
from app.models.intake import Claim, Submission
from app.models.research import Investigation


async def make_user(
    session: AsyncSession,
    *,
    email: str | None = None,
    roles: Sequence[RoleCode] = (RoleCode.RESEARCHER,),
    password: str = "correct-horse-battery-staple",
    display_name: str | None = "Test User",
) -> User:
    address = email or f"user-{uuid.uuid4().hex[:8]}@example.org"
    user = User(
        email=address,
        email_normalized=address.lower(),
        display_name=display_name,
        password_hash=hash_password(password),
        is_active=True,
    )
    session.add(user)
    await session.flush()

    if roles:
        role_rows = (
            (await session.execute(select(Role).where(Role.code.in_(tuple(roles))))).scalars().all()
        )
        by_code = {role.code: role for role in role_rows}
        for code in roles:
            role = by_code[code]
            session.add(UserRole(user_id=user.id, role_id=role.id))
        await session.flush()

    await session.refresh(user, attribute_names=["roles"])
    for assignment in user.roles:
        await session.refresh(assignment, attribute_names=["role"])
    return user


async def make_claim(
    session: AsyncSession,
    *,
    canonical_text: str = "Canonical claim text",
) -> Claim:
    claim = Claim(canonical_text=canonical_text)
    session.add(claim)
    await session.flush()
    return claim


async def make_submission(
    session: AsyncSession,
    *,
    claim_text: str = "A submitted claim for review",
    workflow_status: WorkflowStatus = WorkflowStatus.INBOX,
) -> Submission:
    submission = Submission(claim_text=claim_text, workflow_status=workflow_status)
    session.add(submission)
    await session.flush()
    return submission


async def make_investigation(
    session: AsyncSession,
    *,
    claim: Claim | None = None,
    owner: User | None = None,
    assigned: Sequence[tuple[User, InvestigationAssignmentRole]] | None = None,
) -> Investigation:
    resolved_claim = claim or await make_claim(session)
    investigation = Investigation(
        claim_id=resolved_claim.id,
        owner_id=owner.id if owner else None,
        workflow_status=WorkflowStatus.RESEARCHING,
    )
    session.add(investigation)
    await session.flush()

    if owner is not None:
        session.add(
            InvestigationAssignment(
                investigation_id=investigation.id,
                user_id=owner.id,
                assignment_role=InvestigationAssignmentRole.OWNER,
                assigned_by_id=owner.id,
            )
        )
        await session.flush()

    if assigned:
        for user, role in assigned:
            if owner is not None and user.id == owner.id:
                continue
            session.add(
                InvestigationAssignment(
                    investigation_id=investigation.id,
                    user_id=user.id,
                    assignment_role=role,
                    assigned_by_id=owner.id if owner else user.id,
                )
            )
        await session.flush()

    await session.refresh(investigation, attribute_names=["assignments"])
    return investigation


async def make_document(
    session: AsyncSession,
    *,
    investigation: Investigation,
    visibility: ArchiveVisibility = ArchiveVisibility.INTERNAL,
    title: str = "Supporting document",
    grant_to: Sequence[User] = (),
) -> ArchiveDocument:
    document = ArchiveDocument(
        title=title,
        visibility=visibility,
        investigation_id=investigation.id,
        upload_status=ArchiveUploadStatus.AVAILABLE,
    )
    session.add(document)
    await session.flush()

    for user in grant_to:
        session.add(
            AccessGrant(
                archive_document_id=document.id,
                user_id=user.id,
                granted_by_id=user.id,
                expires_at=datetime.now(UTC) + timedelta(days=30),
            )
        )
    await session.flush()
    await session.refresh(document, attribute_names=["access_grants", "investigation"])
    if document.investigation is not None:
        await session.refresh(document.investigation, attribute_names=["assignments"])
    return document
