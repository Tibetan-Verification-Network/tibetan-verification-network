"""Archive uploads, classification, grants, and signed download links."""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import Select, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.archive_files import detect_archive_mime_type, sanitize_original_filename
from app.core.config import Settings
from app.core.context import get_request_id
from app.core.policy import scope_archive_documents
from app.db.enums import ArchiveUploadStatus, ArchiveVisibility
from app.models.archive import AccessGrant, ArchiveDocument
from app.models.identity import User
from app.models.research import Investigation
from app.schemas.archive import (
    ArchiveAccessLinkResponse,
    ArchiveDocumentListResponse,
    ArchiveDocumentResponse,
    ArchiveGrantCreateRequest,
    ArchiveGrantResponse,
    ArchiveUploadFormMetadata,
)
from app.services.audit import AuditEventType, record_audit_event
from app.services.intake import decode_keyset_cursor, encode_keyset_cursor
from app.storage.base import ObjectStorage
from app.storage.memory import random_storage_key


def _document_response(document: ArchiveDocument) -> ArchiveDocumentResponse:
    return ArchiveDocumentResponse.model_validate(document)


async def upload_investigation_document(
    session: AsyncSession,
    *,
    investigation: Investigation,
    actor: User,
    upload: UploadFile,
    metadata: ArchiveUploadFormMetadata,
    storage: ObjectStorage,
    settings: Settings,
) -> ArchiveDocumentResponse:
    original_name = sanitize_original_filename(upload.filename)
    storage_key = random_storage_key()
    document = ArchiveDocument(
        title=metadata.title.strip(),
        description=metadata.description,
        visibility=ArchiveVisibility.INTERNAL,
        investigation_id=investigation.id,
        original_filename=original_name,
        upload_status=ArchiveUploadStatus.PENDING,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    session.add(document)
    await session.flush()

    hasher = hashlib.sha256()
    chunks_for_storage: list[bytes] = []
    header = b""
    total = 0
    max_bytes = settings.archive_max_upload_bytes

    while True:
        chunk = await upload.read(65_536)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            await session.delete(document)
            await session.flush()
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File exceeds the maximum upload size",
            )
        if len(header) < 8192:
            remaining = 8192 - len(header)
            header += chunk[:remaining]
        hasher.update(chunk)
        chunks_for_storage.append(chunk)

    detected_mime = detect_archive_mime_type(header if header else b"")
    if detected_mime is None:
        await session.delete(document)
        await session.flush()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unsupported or unrecognized file type",
        )

    def _iter_chunks() -> Any:
        yield from chunks_for_storage

    try:
        storage.put_stream(
            storage_key,
            _iter_chunks(),
            content_type=detected_mime,
            content_length=total,
        )
    except Exception:
        await session.delete(document)
        await session.flush()
        raise

    document.storage_key = storage_key
    document.mime_type = detected_mime
    document.byte_size = total
    document.sha256 = hasher.hexdigest()
    document.upload_status = ArchiveUploadStatus.AVAILABLE
    document.updated_by_id = actor.id
    await session.flush()

    await record_audit_event(
        session,
        event_type=AuditEventType.ARCHIVE_UPLOADED,
        actor_user_id=actor.id,
        subject_type="archive_document",
        subject_id=document.id,
        payload={
            "investigation_id": str(investigation.id),
            "visibility": document.visibility.value,
            "mime_type": detected_mime,
            "byte_size": total,
            "sha256": document.sha256,
        },
    )
    await session.refresh(document)
    return _document_response(document)


async def list_archive_documents(
    session: AsyncSession,
    *,
    user: User,
    limit: int,
    cursor: str | None,
    investigation_id: uuid.UUID | None,
) -> ArchiveDocumentListResponse:
    stmt = cast(
        Select[tuple[ArchiveDocument]],
        select(ArchiveDocument).order_by(
            ArchiveDocument.created_at.desc(),
            ArchiveDocument.id.desc(),
        ),
    )
    if investigation_id is not None:
        stmt = stmt.where(ArchiveDocument.investigation_id == investigation_id)
    stmt = scope_archive_documents(stmt, user)
    if cursor:
        created_at, doc_id = decode_keyset_cursor(cursor)
        stmt = stmt.where(
            tuple_(ArchiveDocument.created_at, ArchiveDocument.id) < tuple_(created_at, doc_id)
        )
    stmt = stmt.limit(limit + 1)

    rows = cast(
        list[ArchiveDocument],
        (await session.execute(stmt)).scalars().all(),
    )
    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        last = rows[-1]
        next_cursor = encode_keyset_cursor(last.created_at, last.id)

    return ArchiveDocumentListResponse(
        items=[_document_response(row) for row in rows],
        next_cursor=next_cursor,
    )


async def get_archive_document_detail(
    document: ArchiveDocument,
) -> ArchiveDocumentResponse:
    return _document_response(document)


async def reclassify_document(
    session: AsyncSession,
    *,
    document: ArchiveDocument,
    actor: User,
    visibility: ArchiveVisibility,
    reason: str,
) -> ArchiveDocumentResponse:
    previous = document.visibility
    document.visibility = visibility
    document.classified_by_id = actor.id
    document.updated_by_id = actor.id
    await session.flush()

    if visibility == ArchiveVisibility.RESTRICTED:
        await _ensure_grant(
            session,
            document=document,
            user_id=actor.id,
            granted_by_id=actor.id,
            expires_at=None,
        )

    await record_audit_event(
        session,
        event_type=AuditEventType.ARCHIVE_RECLASSIFIED,
        actor_user_id=actor.id,
        subject_type="archive_document",
        subject_id=document.id,
        payload={
            "previous_visibility": previous.value,
            "visibility": visibility.value,
            "reason": reason.strip(),
        },
    )
    return _document_response(document)


async def create_grant(
    session: AsyncSession,
    *,
    document: ArchiveDocument,
    actor: User,
    body: ArchiveGrantCreateRequest,
) -> ArchiveGrantResponse:
    grant = await _ensure_grant(
        session,
        document=document,
        user_id=body.user_id,
        granted_by_id=actor.id,
        expires_at=body.expires_at,
    )
    await record_audit_event(
        session,
        event_type=AuditEventType.ARCHIVE_GRANT_CREATED,
        actor_user_id=actor.id,
        subject_type="archive_document",
        subject_id=document.id,
        payload={
            "grant_id": str(grant.id),
            "user_id": str(body.user_id),
            "expires_at": body.expires_at.isoformat() if body.expires_at else None,
        },
    )
    return ArchiveGrantResponse.model_validate(grant)


async def revoke_grant(
    session: AsyncSession,
    *,
    document: ArchiveDocument,
    actor: User,
    user_id: uuid.UUID,
) -> None:
    grant = _find_active_grant(document, user_id)
    if grant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    grant.revoked_at = datetime.now(UTC)
    await session.flush()
    await record_audit_event(
        session,
        event_type=AuditEventType.ARCHIVE_GRANT_REVOKED,
        actor_user_id=actor.id,
        subject_type="archive_document",
        subject_id=document.id,
        payload={"user_id": str(user_id), "grant_id": str(grant.id)},
    )


async def issue_access_link(
    session: AsyncSession,
    *,
    document: ArchiveDocument,
    actor: User,
    storage: ObjectStorage,
    settings: Settings,
) -> ArchiveAccessLinkResponse:
    if document.upload_status != ArchiveUploadStatus.AVAILABLE or not document.storage_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    ttl = settings.archive_signed_url_ttl_seconds
    filename = document.original_filename or document.title
    url = storage.presign_get(
        document.storage_key,
        ttl_seconds=ttl,
        filename=filename,
    )
    expires_at = datetime.now(UTC) + timedelta(seconds=ttl)

    if document.visibility == ArchiveVisibility.RESTRICTED:
        await record_audit_event(
            session,
            event_type=AuditEventType.ARCHIVE_RESTRICTED_ACCESS_LINK,
            actor_user_id=actor.id,
            subject_type="archive_document",
            subject_id=document.id,
            payload={
                "request_id": get_request_id(),
                "actor_user_id": str(actor.id),
            },
        )

    return ArchiveAccessLinkResponse(url=url, expires_at=expires_at)


async def _ensure_grant(
    session: AsyncSession,
    *,
    document: ArchiveDocument,
    user_id: uuid.UUID,
    granted_by_id: uuid.UUID,
    expires_at: datetime | None,
) -> AccessGrant:
    existing = _find_grant_row(document, user_id)
    if existing is not None:
        existing.revoked_at = None
        existing.expires_at = expires_at
        existing.granted_by_id = granted_by_id
        await session.flush()
        return existing

    grant = AccessGrant(
        archive_document_id=document.id,
        user_id=user_id,
        granted_by_id=granted_by_id,
        expires_at=expires_at,
    )
    session.add(grant)
    await session.flush()
    await session.refresh(document, attribute_names=["access_grants"])
    return grant


def _find_grant_row(document: ArchiveDocument, user_id: uuid.UUID) -> AccessGrant | None:
    for grant in document.access_grants:
        if grant.user_id == user_id:
            return grant
    return None


def _find_active_grant(document: ArchiveDocument, user_id: uuid.UUID) -> AccessGrant | None:
    moment = datetime.now(UTC)
    for grant in document.access_grants:
        if grant.user_id != user_id or grant.revoked_at is not None:
            continue
        if grant.expires_at is not None and grant.expires_at <= moment:
            continue
        return grant
    return None
