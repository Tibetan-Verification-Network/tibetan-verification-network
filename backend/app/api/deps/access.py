"""Policy-aware object loaders that fail with 404 when access is denied."""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from typing import Annotated, Any, cast

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db_session
from app.core.permissions import get_current_user
from app.core.policy import Action, can
from app.models.archive import ArchiveDocument
from app.models.intake import Submission
from app.models.research import Investigation
from app.services.auth import AuthenticatedUser

POLICY_LOADER_MARK = "__tvn_policy_loader__"


def _mark_loader(dependency: Callable[..., Awaitable[object]]) -> Callable[..., Awaitable[object]]:
    setattr(dependency, POLICY_LOADER_MARK, True)
    return dependency


def load_submission(action: Action) -> Callable[..., Awaitable[Submission]]:
    async def _dependency(
        submission_id: uuid.UUID,
        auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
        db: Annotated[AsyncSession, Depends(get_db_session)],
    ) -> Submission:
        result = await db.execute(
            select(Submission)
            .where(Submission.id == submission_id)
            .options(selectinload(Submission.contact))
        )
        submission = result.scalar_one_or_none()
        if submission is None or not can(auth.user, action, submission):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        return submission

    return cast(Callable[..., Awaitable[Submission]], _mark_loader(_dependency))


def load_investigation(action: Action) -> Callable[..., Awaitable[Investigation]]:
    async def _dependency(
        investigation_id: uuid.UUID,
        auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
        db: Annotated[AsyncSession, Depends(get_db_session)],
    ) -> Investigation:
        result = await db.execute(
            select(Investigation)
            .where(Investigation.id == investigation_id)
            .options(
                selectinload(Investigation.assignments),
                selectinload(Investigation.sources),
                selectinload(Investigation.evidence_items),
                selectinload(Investigation.claim),
            )
        )
        investigation = result.scalar_one_or_none()
        if investigation is None or not can(auth.user, action, investigation):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        return investigation

    return cast(Callable[..., Awaitable[Investigation]], _mark_loader(_dependency))


def load_archive_document(action: Action) -> Callable[..., Awaitable[ArchiveDocument]]:
    async def _dependency(
        document_id: uuid.UUID,
        auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
        db: Annotated[AsyncSession, Depends(get_db_session)],
    ) -> ArchiveDocument:
        result = await db.execute(
            select(ArchiveDocument)
            .where(ArchiveDocument.id == document_id)
            .options(
                selectinload(ArchiveDocument.access_grants),
                selectinload(ArchiveDocument.investigation).selectinload(Investigation.assignments),
            )
        )
        document = result.scalar_one_or_none()
        if document is None or not can(auth.user, action, document):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        return document

    return cast(Callable[..., Awaitable[ArchiveDocument]], _mark_loader(_dependency))


def require_policy_action(action: Action) -> Callable[..., Awaitable[AuthenticatedUser]]:
    async def _dependency(
        auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    ) -> AuthenticatedUser:
        if not can(auth.user, action):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        return auth

    return cast(Callable[..., Awaitable[AuthenticatedUser]], _mark_loader(_dependency))


def route_has_policy_loader(route: Any) -> bool:
    """Return True when a route declares a policy loader dependency."""
    stack = list(route.dependant.dependencies)
    while stack:
        dependency = stack.pop()
        call = dependency.call
        if getattr(call, POLICY_LOADER_MARK, False):
            return True
        stack.extend(dependency.dependencies)
    return False
