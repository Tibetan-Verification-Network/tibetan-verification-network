"""Private archive metadata, uploads, grants, and signed access links."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Form, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.access import load_archive_document, load_investigation, require_policy_action
from app.core.config import Settings
from app.core.deps import get_app_settings, get_db_session
from app.core.permissions import get_current_user, require_csrf_for_cookie_mutations
from app.core.policy import Action
from app.models.archive import ArchiveDocument
from app.models.research import Investigation
from app.schemas.archive import (
    ArchiveAccessLinkResponse,
    ArchiveClassificationRequest,
    ArchiveDocumentListResponse,
    ArchiveDocumentResponse,
    ArchiveGrantCreateRequest,
    ArchiveGrantListResponse,
    ArchiveGrantResponse,
    ArchiveUploadFormMetadata,
)
from app.services.archive import (
    create_grant,
    get_archive_document_detail,
    issue_access_link,
    list_archive_documents,
    list_grants,
    reclassify_document,
    revoke_grant,
    upload_investigation_document,
)
from app.services.auth import AuthenticatedUser
from app.storage.base import ObjectStorage
from app.storage.deps import get_object_storage

investigation_archive_router = APIRouter(prefix="/investigations", tags=["archive"])
archive_router = APIRouter(prefix="/archive", tags=["archive"])

RequireArchiveList = Annotated[
    AuthenticatedUser,
    Depends(require_policy_action(Action.INVESTIGATION_LIST)),
]


@investigation_archive_router.post(
    "/{investigation_id}/documents",
    response_model=ArchiveDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def investigation_document_upload(
    investigation: Annotated[
        Investigation,
        Depends(load_investigation(Action.ARCHIVE_UPLOAD)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    storage: Annotated[ObjectStorage, Depends(get_object_storage)],
    settings: Annotated[Settings, Depends(get_app_settings)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
    file: UploadFile,
    title: Annotated[str, Form(min_length=1, max_length=500)],
    description: Annotated[str | None, Form()] = None,
) -> ArchiveDocumentResponse:
    metadata = ArchiveUploadFormMetadata(title=title, description=description)
    return await upload_investigation_document(
        db,
        investigation=investigation,
        actor=auth.user,
        upload=file,
        metadata=metadata,
        storage=storage,
        settings=settings,
    )


@archive_router.get("/documents", response_model=ArchiveDocumentListResponse)
async def archive_document_list(
    auth: RequireArchiveList,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: str | None = None,
    investigation_id: uuid.UUID | None = None,
) -> ArchiveDocumentListResponse:
    return await list_archive_documents(
        db,
        user=auth.user,
        limit=limit,
        cursor=cursor,
        investigation_id=investigation_id,
    )


@archive_router.get("/documents/{document_id}", response_model=ArchiveDocumentResponse)
async def archive_document_detail(
    document: Annotated[
        ArchiveDocument,
        Depends(load_archive_document(Action.ARCHIVE_VIEW_METADATA)),
    ],
) -> ArchiveDocumentResponse:
    return await get_archive_document_detail(document)


@archive_router.post(
    "/documents/{document_id}/classification",
    response_model=ArchiveDocumentResponse,
)
async def archive_document_classification(
    body: ArchiveClassificationRequest,
    document: Annotated[
        ArchiveDocument,
        Depends(load_archive_document(Action.ARCHIVE_RECLASSIFY)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> ArchiveDocumentResponse:
    return await reclassify_document(
        db,
        document=document,
        actor=auth.user,
        visibility=body.visibility,
        reason=body.reason,
    )


@archive_router.get(
    "/documents/{document_id}/grants",
    response_model=ArchiveGrantListResponse,
)
async def archive_document_grant_list(
    document: Annotated[
        ArchiveDocument,
        Depends(load_archive_document(Action.ARCHIVE_GRANT)),
    ],
) -> ArchiveGrantListResponse:
    return list_grants(document)


@archive_router.post(
    "/documents/{document_id}/grants",
    response_model=ArchiveGrantResponse,
    status_code=status.HTTP_201_CREATED,
)
async def archive_document_grant_create(
    body: ArchiveGrantCreateRequest,
    document: Annotated[
        ArchiveDocument,
        Depends(load_archive_document(Action.ARCHIVE_GRANT)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> ArchiveGrantResponse:
    return await create_grant(db, document=document, actor=auth.user, body=body)


@archive_router.delete(
    "/documents/{document_id}/grants/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def archive_document_grant_revoke(
    user_id: uuid.UUID,
    document: Annotated[
        ArchiveDocument,
        Depends(load_archive_document(Action.ARCHIVE_GRANT)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> None:
    await revoke_grant(db, document=document, actor=auth.user, user_id=user_id)


@archive_router.post(
    "/documents/{document_id}/access-link",
    response_model=ArchiveAccessLinkResponse,
)
async def archive_document_access_link(
    document: Annotated[
        ArchiveDocument,
        Depends(load_archive_document(Action.ARCHIVE_DOWNLOAD)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    storage: Annotated[ObjectStorage, Depends(get_object_storage)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> ArchiveAccessLinkResponse:
    return await issue_access_link(
        db,
        document=document,
        actor=auth.user,
        storage=storage,
        settings=settings,
    )
