"""Investigation workspace, assignments, sources, and evidence."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.access import load_investigation, require_policy_action
from app.core.deps import get_db_session
from app.core.permissions import get_current_user, require_csrf_for_cookie_mutations
from app.core.policy import Action
from app.db.enums import WorkflowStatus
from app.models.research import Investigation
from app.schemas.investigations import (
    AssignmentCreateRequest,
    EvidenceCreateRequest,
    EvidencePatchRequest,
    EvidenceResponse,
    InvestigationCreateRequest,
    InvestigationDetailResponse,
    InvestigationListResponse,
    InvestigationPatchRequest,
    InvestigationStatusRequest,
    ReorderRequest,
    SourceCreateRequest,
    SourcePatchRequest,
    SourceResponse,
)
from app.services.auth import AuthenticatedUser
from app.services.evidence import (
    create_evidence,
    create_source,
    delete_evidence,
    delete_source,
    patch_evidence,
    patch_source,
    reorder_evidence,
    reorder_sources,
    verify_evidence,
)
from app.services.investigations import (
    add_assignment,
    change_investigation_status,
    create_investigation,
    get_investigation_detail,
    list_investigations,
    patch_investigation,
    remove_assignment,
)

router = APIRouter(prefix="/investigations", tags=["investigations"])

RequireInvestigationList = Annotated[
    AuthenticatedUser,
    Depends(require_policy_action(Action.INVESTIGATION_LIST)),
]
RequireInvestigationCreate = Annotated[
    AuthenticatedUser,
    Depends(require_policy_action(Action.INVESTIGATION_CREATE)),
]


@router.post("", response_model=InvestigationDetailResponse, status_code=status.HTTP_201_CREATED)
async def investigation_create(
    body: InvestigationCreateRequest,
    auth: RequireInvestigationCreate,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> InvestigationDetailResponse:
    return await create_investigation(db, actor=auth.user, body=body)


@router.get("", response_model=InvestigationListResponse)
async def investigation_list(
    auth: RequireInvestigationList,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: str | None = None,
    mine: bool = False,
    workflow_status: WorkflowStatus | None = None,
    owner_id: uuid.UUID | None = None,
) -> InvestigationListResponse:
    return await list_investigations(
        db,
        user=auth.user,
        limit=limit,
        cursor=cursor,
        mine=mine,
        workflow_status=workflow_status,
        owner_id=owner_id,
    )


@router.get("/{investigation_id}", response_model=InvestigationDetailResponse)
async def investigation_detail(
    investigation: Annotated[
        Investigation,
        Depends(load_investigation(Action.INVESTIGATION_VIEW)),
    ],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> InvestigationDetailResponse:
    return await get_investigation_detail(db, investigation=investigation)


@router.patch("/{investigation_id}", response_model=InvestigationDetailResponse)
async def investigation_patch(
    body: InvestigationPatchRequest,
    investigation: Annotated[
        Investigation,
        Depends(load_investigation(Action.INVESTIGATION_EDIT)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> InvestigationDetailResponse:
    return await patch_investigation(
        db,
        investigation=investigation,
        actor=auth.user,
        body=body,
    )


@router.post("/{investigation_id}/status", response_model=InvestigationDetailResponse)
async def investigation_status(
    body: InvestigationStatusRequest,
    investigation: Annotated[
        Investigation,
        Depends(load_investigation(Action.INVESTIGATION_EDIT)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> InvestigationDetailResponse:
    return await change_investigation_status(
        db,
        investigation=investigation,
        actor=auth.user,
        body=body,
    )


@router.post("/{investigation_id}/assignments", response_model=InvestigationDetailResponse)
async def investigation_add_assignment(
    body: AssignmentCreateRequest,
    investigation: Annotated[
        Investigation,
        Depends(load_investigation(Action.INVESTIGATION_ASSIGN)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> InvestigationDetailResponse:
    return await add_assignment(
        db,
        investigation=investigation,
        actor=auth.user,
        body=body,
    )


@router.delete(
    "/{investigation_id}/assignments/{user_id}",
    response_model=InvestigationDetailResponse,
)
async def investigation_remove_assignment(
    user_id: uuid.UUID,
    investigation: Annotated[
        Investigation,
        Depends(load_investigation(Action.INVESTIGATION_ASSIGN)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> InvestigationDetailResponse:
    return await remove_assignment(
        db,
        investigation=investigation,
        actor=auth.user,
        user_id=user_id,
    )


@router.post(
    "/{investigation_id}/sources",
    response_model=SourceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def investigation_create_source(
    body: SourceCreateRequest,
    investigation: Annotated[
        Investigation,
        Depends(load_investigation(Action.EVIDENCE_WRITE)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> SourceResponse:
    return await create_source(db, investigation=investigation, actor=auth.user, body=body)


@router.post("/{investigation_id}/sources/reorder", response_model=InvestigationDetailResponse)
async def investigation_reorder_sources(
    body: ReorderRequest,
    investigation: Annotated[
        Investigation,
        Depends(load_investigation(Action.EVIDENCE_WRITE)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> InvestigationDetailResponse:
    return await reorder_sources(
        db,
        investigation=investigation,
        actor=auth.user,
        body=body,
    )


@router.patch("/{investigation_id}/sources/{source_id}", response_model=SourceResponse)
async def investigation_patch_source(
    source_id: uuid.UUID,
    body: SourcePatchRequest,
    investigation: Annotated[
        Investigation,
        Depends(load_investigation(Action.EVIDENCE_WRITE)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> SourceResponse:
    return await patch_source(
        db,
        investigation=investigation,
        source_id=source_id,
        actor=auth.user,
        body=body,
    )


@router.delete(
    "/{investigation_id}/sources/{source_id}",
    response_model=InvestigationDetailResponse,
)
async def investigation_delete_source(
    source_id: uuid.UUID,
    investigation: Annotated[
        Investigation,
        Depends(load_investigation(Action.EVIDENCE_WRITE)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> InvestigationDetailResponse:
    return await delete_source(
        db,
        investigation=investigation,
        source_id=source_id,
        actor=auth.user,
    )


@router.post(
    "/{investigation_id}/evidence",
    response_model=EvidenceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def investigation_create_evidence(
    body: EvidenceCreateRequest,
    investigation: Annotated[
        Investigation,
        Depends(load_investigation(Action.EVIDENCE_WRITE)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> EvidenceResponse:
    return await create_evidence(db, investigation=investigation, actor=auth.user, body=body)


@router.post("/{investigation_id}/evidence/reorder", response_model=InvestigationDetailResponse)
async def investigation_reorder_evidence(
    body: ReorderRequest,
    investigation: Annotated[
        Investigation,
        Depends(load_investigation(Action.EVIDENCE_WRITE)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> InvestigationDetailResponse:
    return await reorder_evidence(
        db,
        investigation=investigation,
        actor=auth.user,
        body=body,
    )


@router.post(
    "/{investigation_id}/evidence/{evidence_id}/verify",
    response_model=EvidenceResponse,
)
async def investigation_verify_evidence(
    evidence_id: uuid.UUID,
    investigation: Annotated[
        Investigation,
        Depends(load_investigation(Action.EVIDENCE_WRITE)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> EvidenceResponse:
    return await verify_evidence(
        db,
        investigation=investigation,
        evidence_id=evidence_id,
        actor=auth.user,
    )


@router.patch("/{investigation_id}/evidence/{evidence_id}", response_model=EvidenceResponse)
async def investigation_patch_evidence(
    evidence_id: uuid.UUID,
    body: EvidencePatchRequest,
    investigation: Annotated[
        Investigation,
        Depends(load_investigation(Action.EVIDENCE_WRITE)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> EvidenceResponse:
    return await patch_evidence(
        db,
        investigation=investigation,
        evidence_id=evidence_id,
        actor=auth.user,
        body=body,
    )


@router.delete(
    "/{investigation_id}/evidence/{evidence_id}",
    response_model=InvestigationDetailResponse,
)
async def investigation_delete_evidence(
    evidence_id: uuid.UUID,
    investigation: Annotated[
        Investigation,
        Depends(load_investigation(Action.EVIDENCE_WRITE)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> InvestigationDetailResponse:
    return await delete_evidence(
        db,
        investigation=investigation,
        evidence_id=evidence_id,
        actor=auth.user,
    )
