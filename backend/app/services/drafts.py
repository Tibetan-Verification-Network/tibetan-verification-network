"""Fact-check creation, bilingual drafts, revisions, and source references."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
import uuid
from typing import Any, cast

from fastapi import HTTPException, status
from sqlalchemy import delete, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.markdown import render_sanitized_html
from app.core.policy import scope_factchecks
from app.core.text_validation import TextValidationError, assert_submission_text
from app.db.enums import (
    LanguageCode,
    LanguageEditorialStatus,
    WorkflowStatus,
)
from app.models.assignments import InvestigationAssignment
from app.models.identity import User
from app.models.publication import (
    FactCheck,
    FactCheckContent,
    FactCheckContentRevision,
    FactCheckContentSource,
)
from app.models.research import Investigation, Source
from app.schemas.common import LanguageCode as ApiLanguageCode
from app.schemas.factchecks import (
    DraftPatchRequest,
    DraftResponse,
    DraftSourceReferenceResponse,
    DraftSourcesReplaceRequest,
    FactCheckCreateRequest,
    FactCheckCreateResponse,
    FactCheckDetailResponse,
    FactCheckLanguageBriefResponse,
    FactCheckListItemResponse,
    FactCheckListResponse,
    FactCheckPatchRequest,
    FactCheckSummaryResponse,
    LanguageContentSummaryResponse,
    MarkdownPreviewRequest,
    MarkdownPreviewResponse,
    RevisionListResponse,
    RevisionSummaryResponse,
)
from app.services.audit import AuditEventType, record_audit_event
from app.services.intake import decode_keyset_cursor, encode_keyset_cursor
from app.workflow.engine import TransitionSubject, apply_transition
from app.workflow.readiness import check_readiness

_SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

_EDITABLE_STATUSES = frozenset(
    {
        LanguageEditorialStatus.DRAFT,
        LanguageEditorialStatus.CHANGES_REQUESTED,
    }
)

_TEXT_FIELD_LIMITS: dict[str, int | None] = {
    "title": 500,
    "summary": 10000,
    "claim_text": None,
    "context_text": None,
    "verdict_explanation": None,
    "analysis_markdown": None,
    "limitations_markdown": None,
}


def validate_public_slug(slug: str) -> str:
    normalized = slug.strip().lower()
    if not normalized or len(normalized) > 160:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_slug", "message": "Slug must be 1-160 characters"},
        )
    if not _SLUG_PATTERN.fullmatch(normalized):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_slug",
                "message": "Slug may contain only lowercase letters, digits, and hyphens",
            },
        )
    return normalized


def _language_code(value: LanguageCode | str) -> LanguageCode:
    if isinstance(value, LanguageCode):
        return value
    return LanguageCode(value)


async def _load_fact_check_graph(
    session: AsyncSession,
    fact_check_id: uuid.UUID,
) -> FactCheck | None:
    result = await session.execute(
        select(FactCheck)
        .where(FactCheck.id == fact_check_id)
        .options(
            selectinload(FactCheck.contents).selectinload(FactCheckContent.source_links),
            selectinload(FactCheck.contents).selectinload(FactCheckContent.live_version),
            selectinload(FactCheck.investigation),
        )
    )
    return result.scalar_one_or_none()


async def _load_content_for_language(
    session: AsyncSession,
    *,
    fact_check_id: uuid.UUID,
    language: LanguageCode,
) -> FactCheckContent | None:
    result = await session.execute(
        select(FactCheckContent)
        .where(
            FactCheckContent.fact_check_id == fact_check_id,
            FactCheckContent.language == _language_code(language),
        )
        .options(
            selectinload(FactCheckContent.source_links),
            selectinload(FactCheckContent.fact_check).selectinload(FactCheck.investigation),
        )
    )
    return result.scalar_one_or_none()


def _source_refs_payload(content: FactCheckContent) -> list[dict[str, Any]]:
    ordered = sorted(content.source_links, key=lambda row: row.position)
    return [
        {
            "source_id": str(link.source_id),
            "relevance_note": link.relevance_note,
            "position": link.position,
        }
        for link in ordered
    ]


def _revision_fields_snapshot(content: FactCheckContent) -> dict[str, Any]:
    return {
        "title": content.title,
        "summary": content.summary,
        "claim_text": content.claim_text,
        "context_text": content.context_text,
        "verdict": content.verdict.value if content.verdict else None,
        "verdict_explanation": content.verdict_explanation,
        "analysis_markdown": content.analysis_markdown,
        "limitations_markdown": content.limitations_markdown,
        "sources": _source_refs_payload(content),
    }


def _revision_checksum(fields: dict[str, Any]) -> str:
    canonical = json.dumps(fields, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _normalize_optional_text(
    value: str | None,
    *,
    field_name: str,
    max_length: int | None,
) -> str | None:
    if value is None:
        return None
    try:
        assert_submission_text(value, field_name=field_name)
    except TextValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_text", "message": str(exc)},
        ) from exc
    normalized = unicodedata.normalize("NFC", value)
    if max_length is not None and len(normalized) > max_length:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_text",
                "message": f"{field_name} exceeds maximum length of {max_length}",
            },
        )
    return normalized


def _draft_locked_response(status_value: LanguageEditorialStatus) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "draft_locked",
            "message": (
                f"Draft edits are not allowed while editorial status is {status_value.value}; "
                "reopen the language version first"
            ),
            "editorial_status": status_value.value,
        },
    )


def _stale_revision_response(expected: int, current: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "stale_revision",
            "message": "expected_revision does not match the current revision",
            "expected_revision": expected,
            "current_revision_number": current,
        },
    )


def _draft_response(content: FactCheckContent) -> DraftResponse:
    ordered = sorted(content.source_links, key=lambda row: row.position)
    return DraftResponse(
        fact_check_id=content.fact_check_id,
        language=ApiLanguageCode(content.language.value),
        editorial_status=content.editorial_status,
        translation_status=content.translation_status,
        current_revision_number=content.current_revision_number,
        title=content.title,
        summary=content.summary,
        claim_text=content.claim_text,
        context_text=content.context_text,
        verdict=content.verdict,
        verdict_explanation=content.verdict_explanation,
        analysis_markdown=content.analysis_markdown,
        limitations_markdown=content.limitations_markdown,
        sources=[
            DraftSourceReferenceResponse(
                source_id=link.source_id,
                relevance_note=link.relevance_note,
                position=link.position,
            )
            for link in ordered
        ],
    )


def _live_version_number(content: FactCheckContent) -> int | None:
    version = content.live_version
    if version is None:
        return None
    return version.version_number


async def _language_summaries(
    session: AsyncSession,
    fact_check: FactCheck,
) -> list[LanguageContentSummaryResponse]:
    investigation = fact_check.investigation
    summaries: list[LanguageContentSummaryResponse] = []
    for content in sorted(fact_check.contents, key=lambda row: row.language.value):
        issues: list[str] = []
        if investigation is not None:
            issues = await check_readiness(
                session,
                fact_check=fact_check,
                content=content,
                investigation=investigation,
            )
        summaries.append(
            LanguageContentSummaryResponse(
                content_id=content.id,
                language=ApiLanguageCode(content.language.value),
                editorial_status=content.editorial_status,
                translation_status=content.translation_status,
                current_revision_number=content.current_revision_number,
                live_version_number=_live_version_number(content),
                published_at=content.published_at,
                readiness_issues=issues,
            )
        )
    return summaries


async def create_fact_check(
    session: AsyncSession,
    *,
    investigation: Investigation,
    actor: User,
    body: FactCheckCreateRequest,
) -> FactCheckCreateResponse:
    existing_fc = await session.scalar(
        select(FactCheck.id).where(FactCheck.investigation_id == investigation.id)
    )
    if existing_fc is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "fact_check_exists",
                "message": "Investigation already has a fact check",
            },
        )

    fact_check = FactCheck(
        investigation_id=investigation.id,
        owner_id=actor.id,
        workflow_status=WorkflowStatus.DRAFTING,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    session.add(fact_check)
    await session.flush()

    for lang in body.languages:
        session.add(
            FactCheckContent(
                fact_check_id=fact_check.id,
                language=_language_code(lang),
                created_by_id=actor.id,
                updated_by_id=actor.id,
            )
        )
    await session.flush()

    if investigation.workflow_status == WorkflowStatus.RESEARCHING:
        await apply_transition(
            session,
            subject=TransitionSubject.INVESTIGATION,
            entity_id=investigation.id,
            to_status=WorkflowStatus.DRAFTING,
            actor=actor,
        )

    await record_audit_event(
        session,
        event_type=AuditEventType.FACTCHECK_CREATED,
        actor_user_id=actor.id,
        subject_type="fact_check",
        subject_id=fact_check.id,
        payload={
            "investigation_id": str(investigation.id),
            "languages": [lang.value for lang in body.languages],
        },
    )
    await session.flush()
    await session.refresh(fact_check, attribute_names=["contents", "workflow_status"])

    return FactCheckCreateResponse(
        id=fact_check.id,
        investigation_id=investigation.id,
        workflow_status=fact_check.workflow_status,
        public_slug=fact_check.public_slug,
        languages=[ApiLanguageCode(row.language.value) for row in fact_check.contents],
    )


async def list_fact_checks(
    session: AsyncSession,
    *,
    user: User,
    limit: int,
    cursor: str | None,
    workflow_status: WorkflowStatus | None = None,
    language: LanguageCode | None = None,
    mine: bool = False,
    awaiting_my_approval: bool = False,
) -> FactCheckListResponse:
    stmt = scope_factchecks(select(FactCheck), user).order_by(
        FactCheck.created_at.desc(),
        FactCheck.id.desc(),
    )
    if workflow_status is not None:
        stmt = stmt.where(FactCheck.workflow_status == workflow_status)
    if language is not None:
        lang = _language_code(language)
        matching_ids = (
            select(FactCheckContent.fact_check_id)
            .where(FactCheckContent.language == lang)
            .scalar_subquery()
        )
        stmt = stmt.where(FactCheck.id.in_(matching_ids))
    if mine:
        assigned_ids = (
            select(InvestigationAssignment.investigation_id)
            .where(
                InvestigationAssignment.user_id == user.id,
                InvestigationAssignment.removed_at.is_(None),
            )
            .scalar_subquery()
        )
        stmt = stmt.where(
            or_(
                FactCheck.owner_id == user.id,
                FactCheck.investigation_id.in_(assigned_ids),
            )
        )
    if awaiting_my_approval:
        queue_ids = (
            select(FactCheckContent.fact_check_id)
            .where(FactCheckContent.editorial_status == LanguageEditorialStatus.READY_FOR_APPROVAL)
            .scalar_subquery()
        )
        stmt = stmt.where(FactCheck.id.in_(queue_ids))
    if cursor is not None:
        cursor_created_at, cursor_id = decode_keyset_cursor(cursor)
        stmt = stmt.where(
            tuple_(FactCheck.created_at, FactCheck.id) < tuple_(cursor_created_at, cursor_id)
        )

    rows = cast(
        list[FactCheck],
        (
            await session.execute(
                stmt.options(selectinload(FactCheck.contents)).limit(limit + 1)
            )
        )
        .scalars()
        .all(),
    )
    items = [
        FactCheckListItemResponse(
            **FactCheckSummaryResponse.model_validate(row).model_dump(),
            languages=[
                FactCheckLanguageBriefResponse(
                    language=ApiLanguageCode(content.language.value),
                    editorial_status=content.editorial_status,
                    title=content.title,
                )
                for content in sorted(row.contents, key=lambda c: c.language.value)
            ],
        )
        for row in rows[:limit]
    ]
    next_cursor = None
    if len(rows) > limit:
        last = rows[limit - 1]
        next_cursor = encode_keyset_cursor(last.created_at, last.id)
    return FactCheckListResponse(items=items, next_cursor=next_cursor)


async def get_fact_check_detail(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
) -> FactCheckDetailResponse:
    loaded = await _load_fact_check_graph(session, fact_check.id)
    assert loaded is not None
    return FactCheckDetailResponse(
        fact_check=FactCheckSummaryResponse.model_validate(loaded),
        languages=await _language_summaries(session, loaded),
    )


async def patch_fact_check(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    actor: User,
    body: FactCheckPatchRequest,
) -> FactCheckDetailResponse:
    loaded = await _load_fact_check_graph(session, fact_check.id)
    assert loaded is not None

    slug = validate_public_slug(body.public_slug)
    if loaded.public_slug == slug:
        return await get_fact_check_detail(session, fact_check=loaded)

    any_published = any(
        content.editorial_status == LanguageEditorialStatus.PUBLISHED for content in loaded.contents
    )
    if any_published:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "slug_immutable",
                "message": "public_slug cannot change after a language version is published",
            },
        )

    existing = await session.scalar(select(FactCheck.id).where(FactCheck.public_slug == slug))
    if existing is not None and existing != loaded.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "slug_taken", "message": "public_slug is already in use"},
        )

    loaded.public_slug = slug
    loaded.updated_by_id = actor.id
    await session.flush()
    return await get_fact_check_detail(session, fact_check=loaded)


async def get_language_draft(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    language: LanguageCode,
) -> DraftResponse:
    content = await _load_content_for_language(
        session,
        fact_check_id=fact_check.id,
        language=language,
    )
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return _draft_response(content)


async def patch_language_draft(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    language: LanguageCode,
    actor: User,
    body: DraftPatchRequest,
) -> DraftResponse:
    result = await session.execute(
        select(FactCheckContent)
        .where(
            FactCheckContent.fact_check_id == fact_check.id,
            FactCheckContent.language == _language_code(language),
        )
        .options(selectinload(FactCheckContent.source_links))
        .with_for_update()
    )
    content = result.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    if content.editorial_status not in _EDITABLE_STATUSES:
        raise _draft_locked_response(content.editorial_status)

    if body.expected_revision != content.current_revision_number:
        raise _stale_revision_response(body.expected_revision, content.current_revision_number)

    patch_fields = body.model_fields_set - {"expected_revision"}
    material_change = False

    for field_name in patch_fields:
        if field_name == "translation_status":
            if body.translation_status is not None:
                content.translation_status = body.translation_status
            continue
        raw_value = getattr(body, field_name)
        if raw_value is None:
            continue
        value = _normalize_optional_text(
            raw_value,
            field_name=field_name,
            max_length=_TEXT_FIELD_LIMITS.get(field_name),
        )
        setattr(content, field_name, value)
        material_change = True

    if material_change:
        snapshot = _revision_fields_snapshot(content)
        new_number = content.current_revision_number + 1
        checksum = _revision_checksum(snapshot)
        session.add(
            FactCheckContentRevision(
                content_id=content.id,
                revision_number=new_number,
                fields=snapshot,
                checksum=checksum,
                created_by_id=actor.id,
            )
        )
        content.current_revision_number = new_number
        content.updated_by_id = actor.id
        await record_audit_event(
            session,
            event_type=AuditEventType.DRAFT_REVISION_SAVED,
            actor_user_id=actor.id,
            subject_type="fact_check_content",
            subject_id=content.id,
            payload={
                "fact_check_id": str(fact_check.id),
                "language": content.language.value,
                "revision_number": new_number,
            },
        )

    await session.flush()
    await session.refresh(content, attribute_names=["source_links"])
    return _draft_response(content)


async def replace_language_sources(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    language: LanguageCode,
    actor: User,
    body: DraftSourcesReplaceRequest,
) -> DraftResponse:
    result = await session.execute(
        select(FactCheckContent)
        .where(
            FactCheckContent.fact_check_id == fact_check.id,
            FactCheckContent.language == _language_code(language),
        )
        .options(
            selectinload(FactCheckContent.source_links),
            selectinload(FactCheckContent.fact_check).selectinload(FactCheck.investigation),
        )
        .with_for_update()
    )
    content = result.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    if content.editorial_status not in _EDITABLE_STATUSES:
        raise _draft_locked_response(content.editorial_status)

    investigation_id = content.fact_check.investigation_id
    if investigation_id is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    source_ids = [item.source_id for item in body.items]
    if source_ids:
        rows = (
            await session.execute(select(Source).where(Source.id.in_(tuple(source_ids))))
        ).scalars().all()
        by_id = {row.id: row for row in rows}
        if len(by_id) != len(set(source_ids)):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)
        for source_id in source_ids:
            source = by_id[source_id]
            if source.investigation_id != investigation_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={
                        "code": "foreign_source",
                        "message": "Each source must belong to this fact check's investigation",
                    },
                )

    for item in body.items:
        if item.relevance_note is not None:
            item.relevance_note = _normalize_optional_text(
                item.relevance_note,
                field_name="relevance_note",
                max_length=5000,
            )

    await session.execute(
        delete(FactCheckContentSource).where(FactCheckContentSource.content_id == content.id)
    )
    for item in body.items:
        session.add(
            FactCheckContentSource(
                content_id=content.id,
                source_id=item.source_id,
                relevance_note=item.relevance_note,
                position=item.position,
            )
        )

    await session.flush()
    await session.refresh(content, attribute_names=["source_links"])
    snapshot = _revision_fields_snapshot(content)
    new_number = content.current_revision_number + 1
    checksum = _revision_checksum(snapshot)
    session.add(
        FactCheckContentRevision(
            content_id=content.id,
            revision_number=new_number,
            fields=snapshot,
            checksum=checksum,
            created_by_id=actor.id,
        )
    )
    content.current_revision_number = new_number
    content.updated_by_id = actor.id
    await record_audit_event(
        session,
        event_type=AuditEventType.DRAFT_REVISION_SAVED,
        actor_user_id=actor.id,
        subject_type="fact_check_content",
        subject_id=content.id,
        payload={
            "fact_check_id": str(fact_check.id),
            "language": content.language.value,
            "revision_number": new_number,
            "reason": "sources_updated",
        },
    )
    await session.flush()
    await session.refresh(content, attribute_names=["source_links"])
    return _draft_response(content)


def preview_markdown(body: MarkdownPreviewRequest) -> MarkdownPreviewResponse:
    analysis_html = ""
    limitations_html = ""
    if body.analysis_markdown is not None:
        analysis_html = render_sanitized_html(
            body.analysis_markdown,
            field_name="analysis_markdown",
        )
    if body.limitations_markdown is not None:
        limitations_html = render_sanitized_html(
            body.limitations_markdown,
            field_name="limitations_markdown",
        )
    return MarkdownPreviewResponse(analysis_html=analysis_html, limitations_html=limitations_html)


async def list_language_revisions(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    language: LanguageCode,
) -> RevisionListResponse:
    content = await _load_content_for_language(
        session,
        fact_check_id=fact_check.id,
        language=language,
    )
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    rows = (
        await session.execute(
            select(FactCheckContentRevision)
            .where(FactCheckContentRevision.content_id == content.id)
            .order_by(FactCheckContentRevision.revision_number.desc())
        )
    ).scalars().all()

    items = [
        RevisionSummaryResponse(
            revision_number=row.revision_number,
            checksum=row.checksum,
            created_by_id=row.created_by_id,
            created_at=row.created_at,
        )
        for row in rows
    ]
    return RevisionListResponse(items=items)
