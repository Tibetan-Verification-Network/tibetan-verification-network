"""Sources and evidence items for investigation workspaces."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.urls import UnsafeUrlError, parse_submission_source_url
from app.models.archive import ArchiveDocument
from app.models.identity import User
from app.models.research import EvidenceItem, Investigation, Source
from app.schemas.investigations import (
    EvidenceCreateRequest,
    EvidencePatchRequest,
    EvidenceResponse,
    InvestigationDetailResponse,
    ReorderRequest,
    SourceCreateRequest,
    SourcePatchRequest,
    SourceResponse,
)
from app.services.audit import AuditEventType, record_audit_event
from app.services.investigations import get_investigation_detail


def _next_position(existing: list[Source | EvidenceItem]) -> int:
    positions = [row.position for row in existing if row.position is not None]
    return max(positions, default=-1) + 1


def _parse_source_url(raw: str | None) -> tuple[str | None, str | None]:
    if raw is None or not raw.strip():
        return None, None
    try:
        normalized = parse_submission_source_url(raw)
    except UnsafeUrlError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return raw.strip(), normalized


async def _require_same_investigation_source(
    session: AsyncSession,
    *,
    investigation_id: uuid.UUID,
    source_id: uuid.UUID,
) -> Source:
    source = await session.get(Source, source_id)
    if source is None or source.investigation_id != investigation_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)
    return source


async def _require_same_investigation_document(
    session: AsyncSession,
    *,
    investigation_id: uuid.UUID,
    document_id: uuid.UUID,
) -> ArchiveDocument:
    document = await session.get(ArchiveDocument, document_id)
    if document is None or document.investigation_id != investigation_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)
    return document


async def create_source(
    session: AsyncSession,
    *,
    investigation: Investigation,
    actor: User,
    body: SourceCreateRequest,
) -> SourceResponse:
    url, normalized_url = _parse_source_url(body.url)
    retrieved_at = body.retrieved_at or datetime.now(UTC)
    position = body.position
    if position is None:
        position = _next_position(list(investigation.sources))

    source = Source(
        investigation_id=investigation.id,
        title=body.title,
        url=url,
        normalized_url=normalized_url,
        publisher=body.publisher,
        author=body.author,
        published_at=body.published_at,
        retrieved_at=retrieved_at,
        source_language=body.source_language,
        reliability_notes=body.reliability_notes,
        position=position,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    session.add(source)
    await session.flush()
    return SourceResponse.model_validate(source)


async def patch_source(
    session: AsyncSession,
    *,
    investigation: Investigation,
    source_id: uuid.UUID,
    actor: User,
    body: SourcePatchRequest,
) -> SourceResponse:
    source = await _require_same_investigation_source(
        session,
        investigation_id=investigation.id,
        source_id=source_id,
    )
    if body.title is not None:
        source.title = body.title
    if body.url is not None:
        url, normalized_url = _parse_source_url(body.url)
        source.url = url
        source.normalized_url = normalized_url
    if body.publisher is not None:
        source.publisher = body.publisher
    if body.author is not None:
        source.author = body.author
    if body.published_at is not None:
        source.published_at = body.published_at
    if body.retrieved_at is not None:
        source.retrieved_at = body.retrieved_at
    if body.source_language is not None:
        source.source_language = body.source_language
    if body.reliability_notes is not None:
        source.reliability_notes = body.reliability_notes
    if body.position is not None:
        source.position = body.position
    source.updated_by_id = actor.id
    await session.flush()
    return SourceResponse.model_validate(source)


async def delete_source(
    session: AsyncSession,
    *,
    investigation: Investigation,
    source_id: uuid.UUID,
    actor: User,
) -> InvestigationDetailResponse:
    source = await _require_same_investigation_source(
        session,
        investigation_id=investigation.id,
        source_id=source_id,
    )
    summary: dict[str, Any] = {
        "source_id": str(source.id),
        "title": source.title,
        "url": source.normalized_url or source.url,
    }
    await session.delete(source)
    await record_audit_event(
        session,
        event_type=AuditEventType.SOURCE_DELETED,
        actor_user_id=actor.id,
        subject_type="investigation",
        subject_id=investigation.id,
        payload=summary,
    )
    await session.flush()
    return await get_investigation_detail(session, investigation=investigation)


async def reorder_sources(
    session: AsyncSession,
    *,
    investigation: Investigation,
    actor: User,
    body: ReorderRequest,
) -> InvestigationDetailResponse:
    by_id = {row.id: row for row in investigation.sources}
    if set(body.ordered_ids) != set(by_id.keys()):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)
    for index, source_id in enumerate(body.ordered_ids):
        by_id[source_id].position = index
        by_id[source_id].updated_by_id = actor.id
    await session.flush()
    return await get_investigation_detail(session, investigation=investigation)


async def create_evidence(
    session: AsyncSession,
    *,
    investigation: Investigation,
    actor: User,
    body: EvidenceCreateRequest,
) -> EvidenceResponse:
    if body.source_id is not None:
        await _require_same_investigation_source(
            session,
            investigation_id=investigation.id,
            source_id=body.source_id,
        )
    if body.archive_document_id is not None:
        await _require_same_investigation_document(
            session,
            investigation_id=investigation.id,
            document_id=body.archive_document_id,
        )
    position = body.position
    if position is None:
        position = _next_position(list(investigation.evidence_items))

    item = EvidenceItem(
        investigation_id=investigation.id,
        excerpt=body.excerpt,
        notes=body.notes,
        stance=body.stance,
        source_id=body.source_id,
        archive_document_id=body.archive_document_id,
        position=position,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    session.add(item)
    await session.flush()
    return EvidenceResponse.model_validate(item)


async def patch_evidence(
    session: AsyncSession,
    *,
    investigation: Investigation,
    evidence_id: uuid.UUID,
    actor: User,
    body: EvidencePatchRequest,
) -> EvidenceResponse:
    item = await session.get(EvidenceItem, evidence_id)
    if item is None or item.investigation_id != investigation.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    clears_verification = False
    if body.source_id is not None:
        await _require_same_investigation_source(
            session,
            investigation_id=investigation.id,
            source_id=body.source_id,
        )
        if body.source_id != item.source_id:
            clears_verification = True
        item.source_id = body.source_id
    if body.archive_document_id is not None:
        await _require_same_investigation_document(
            session,
            investigation_id=investigation.id,
            document_id=body.archive_document_id,
        )
        item.archive_document_id = body.archive_document_id
    if body.excerpt is not None:
        if body.excerpt != item.excerpt:
            clears_verification = True
        item.excerpt = body.excerpt
    if body.notes is not None:
        item.notes = body.notes
    if body.stance is not None:
        item.stance = body.stance
    if body.position is not None:
        item.position = body.position
    if clears_verification and item.verified_at is not None:
        item.verified_at = None
        item.verified_by_id = None
        await record_audit_event(
            session,
            event_type=AuditEventType.EVIDENCE_VERIFICATION_CLEARED,
            actor_user_id=actor.id,
            subject_type="evidence_item",
            subject_id=item.id,
            payload={"investigation_id": str(investigation.id), "reason": "material_edit"},
        )
    item.updated_by_id = actor.id
    await session.flush()
    return EvidenceResponse.model_validate(item)


async def verify_evidence(
    session: AsyncSession,
    *,
    investigation: Investigation,
    evidence_id: uuid.UUID,
    actor: User,
) -> EvidenceResponse:
    item = await session.get(EvidenceItem, evidence_id)
    if item is None or item.investigation_id != investigation.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    now = datetime.now(UTC)
    item.verified_at = now
    item.verified_by_id = actor.id
    item.updated_by_id = actor.id
    await record_audit_event(
        session,
        event_type=AuditEventType.EVIDENCE_VERIFIED,
        actor_user_id=actor.id,
        subject_type="evidence_item",
        subject_id=item.id,
        payload={"investigation_id": str(investigation.id)},
    )
    await session.flush()
    await session.refresh(item)
    return EvidenceResponse.model_validate(item)


async def delete_evidence(
    session: AsyncSession,
    *,
    investigation: Investigation,
    evidence_id: uuid.UUID,
    actor: User,
) -> InvestigationDetailResponse:
    item = await session.get(EvidenceItem, evidence_id)
    if item is None or item.investigation_id != investigation.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    summary: dict[str, Any] = {
        "evidence_id": str(item.id),
        "stance": item.stance.value if item.stance else None,
        "excerpt": (item.excerpt or "")[:200],
    }
    await session.delete(item)
    await record_audit_event(
        session,
        event_type=AuditEventType.EVIDENCE_DELETED,
        actor_user_id=actor.id,
        subject_type="investigation",
        subject_id=investigation.id,
        payload=summary,
    )
    await session.flush()
    return await get_investigation_detail(session, investigation=investigation)


async def reorder_evidence(
    session: AsyncSession,
    *,
    investigation: Investigation,
    actor: User,
    body: ReorderRequest,
) -> InvestigationDetailResponse:
    by_id = {row.id: row for row in investigation.evidence_items}
    if set(body.ordered_ids) != set(by_id.keys()):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)
    for index, evidence_id in enumerate(body.ordered_ids):
        by_id[evidence_id].position = index
        by_id[evidence_id].updated_by_id = actor.id
    await session.flush()
    return await get_investigation_detail(session, investigation=investigation)
