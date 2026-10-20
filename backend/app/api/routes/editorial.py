"""Minimal authenticated editorial surface for Phase 1 protection checks."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.access import require_policy_action
from app.api.routes.editorial_intake import router as editorial_intake_router
from app.api.routes.editorial_topics import router as editorial_topics_router
from app.core.deps import get_db_session
from app.core.permissions import RequireStaff
from app.core.policy import Action
from app.schemas.audit import AuditEventListResponse
from app.schemas.auth import EditorialStatusResponse
from app.schemas.factchecks import ApprovalQueueResponse
from app.services.audit_query import list_audit_events
from app.services.auth import AuthenticatedUser
from app.services.reviews import list_approval_queue

router = APIRouter(prefix="/editorial", tags=["editorial"])
router.include_router(editorial_intake_router)
router.include_router(editorial_topics_router)

RequireApprovalQueue = Annotated[
    AuthenticatedUser,
    Depends(require_policy_action(Action.APPROVE)),
]

RequireAuditView = Annotated[
    AuthenticatedUser,
    Depends(require_policy_action(Action.AUDIT_VIEW)),
]


@router.get("/status", response_model=EditorialStatusResponse)
async def editorial_status(
    auth: RequireStaff,
) -> EditorialStatusResponse:
    roles = sorted({assignment.role.code for assignment in auth.user.roles})
    return EditorialStatusResponse(status="ok", roles=roles)


@router.get("/approval-queue", response_model=ApprovalQueueResponse)
async def editorial_approval_queue(
    auth: RequireApprovalQueue,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: str | None = None,
) -> ApprovalQueueResponse:
    return await list_approval_queue(db, user=auth.user, limit=limit, cursor=cursor)


@router.get("/audit", response_model=AuditEventListResponse)
async def editorial_audit_list(
    auth: RequireAuditView,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    subject_type: str,
    subject_id: uuid.UUID,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: str | None = None,
) -> AuditEventListResponse:
    return await list_audit_events(
        db,
        user=auth.user,
        subject_type=subject_type,
        subject_id=subject_id,
        limit=limit,
        cursor=cursor,
    )
