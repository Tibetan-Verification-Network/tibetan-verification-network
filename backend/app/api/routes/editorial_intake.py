"""Editorial submission inbox, triage, and claims."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.access import load_submission, require_policy_action
from app.core.config import Settings
from app.core.deps import get_db_session
from app.core.permissions import get_current_user, require_csrf_for_cookie_mutations
from app.core.policy import Action
from app.db.enums import SubmissionChannel, WorkflowStatus
from app.models.intake import Submission
from app.schemas.intake import (
    ClaimDetailResponse,
    ClaimListResponse,
    SubmissionContactResponse,
    SubmissionDetailResponse,
    SubmissionListResponse,
    TriageRequest,
)
from app.services.auth import AuthenticatedUser
from app.services.intake import (
    apply_triage_action,
    get_claim_detail,
    get_submission_contact,
    get_submission_detail,
    list_claims,
    list_submissions,
)

router = APIRouter(tags=["editorial-intake"])


def _settings(request: Request) -> Settings:
    settings = request.app.state.settings
    if not isinstance(settings, Settings):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE)
    return settings


RequireSubmissionList = Annotated[
    AuthenticatedUser,
    Depends(require_policy_action(Action.SUBMISSION_LIST)),
]


@router.get("/submissions", response_model=SubmissionListResponse)
async def editorial_submission_list(
    auth: RequireSubmissionList,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(_settings)],
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: str | None = None,
    workflow_status: WorkflowStatus | None = None,
    assigned_to_id: uuid.UUID | None = None,
    channel: SubmissionChannel | None = None,
) -> SubmissionListResponse:
    _ = settings
    return await list_submissions(
        db,
        user=auth.user,
        limit=limit,
        cursor=cursor,
        workflow_status=workflow_status,
        assigned_to_id=assigned_to_id,
        channel=channel,
    )


@router.get("/submissions/{submission_id}", response_model=SubmissionDetailResponse)
async def editorial_submission_detail(
    submission: Annotated[Submission, Depends(load_submission(Action.SUBMISSION_LIST))],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(_settings)],
) -> SubmissionDetailResponse:
    return await get_submission_detail(db, submission=submission, settings=settings)


@router.get("/submissions/{submission_id}/contact", response_model=SubmissionContactResponse | None)
async def editorial_submission_contact(
    submission: Annotated[
        Submission,
        Depends(load_submission(Action.SUBMISSION_CONTACT_VIEW)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> SubmissionContactResponse | None:
    return await get_submission_contact(
        db,
        submission=submission,
        actor_user_id=auth.user.id,
    )


@router.post("/submissions/{submission_id}/triage", response_model=SubmissionDetailResponse)
async def editorial_submission_triage(
    submission: Annotated[Submission, Depends(load_submission(Action.SUBMISSION_TRIAGE))],
    body: TriageRequest,
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(_settings)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> SubmissionDetailResponse:
    return await apply_triage_action(
        db,
        submission_id=submission.id,
        actor=auth.user,
        body=body,
        settings=settings,
    )


@router.get("/claims", response_model=ClaimListResponse)
async def editorial_claim_list(
    auth: RequireSubmissionList,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: str | None = None,
) -> ClaimListResponse:
    _ = auth
    return await list_claims(db, limit=limit, cursor=cursor)


@router.get("/claims/{claim_id}", response_model=ClaimDetailResponse)
async def editorial_claim_detail(
    claim_id: uuid.UUID,
    auth: RequireSubmissionList,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> ClaimDetailResponse:
    _ = auth
    detail = await get_claim_detail(db, claim_id=claim_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return detail
