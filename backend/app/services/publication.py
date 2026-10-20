"""Transactional publication, immutable snapshots, corrections, and withdrawal."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.editorial_rules import PUBLICATION_ATTRIBUTION
from app.core.markdown import render_sanitized_html
from app.db.enums import ArticleVersionKind, LanguageEditorialStatus, ReviewDecision
from app.models.identity import User
from app.models.publication import (
    ArticleVersion,
    FactCheck,
    FactCheckContent,
    Review,
)
from app.schemas.common import LanguageCode
from app.schemas.factchecks import (
    ArticleVersionDetailResponse,
    ArticleVersionListResponse,
    ArticleVersionSummaryResponse,
    CorrectionStartRequest,
    DraftResponse,
    PublicArticleSnapshot,
    PublicSnapshotSource,
    PublishRequest,
    PublishResponse,
    WithdrawRequest,
)
from app.services.audit import AuditEventType, record_audit_event
from app.services.drafts import (
    _draft_response,
    _language_code,
    _revision_checksum,
    _revision_fields_snapshot,
)
from app.services.public_index import topic_slugs_for_fact_check, upsert_public_article
from app.services.reviews import (
    _load_locked_content,
    _readiness_http_exception,
    _revision_for_number,
)
from app.workflow.engine import TransitionSubject, apply_transition
from app.workflow.exceptions import InvalidTransitionError, TransitionBlockedError
from app.workflow.guards import assert_is_approving_reviewer
from app.workflow.http import http_conflict_from_guard, http_conflict_from_transition
from app.workflow.readiness import check_readiness


def snapshot_checksum(snapshot: PublicArticleSnapshot) -> str:
    payload = snapshot.model_dump(mode="json")
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def verify_snapshot_checksum(version: ArticleVersion) -> bool:
    try:
        snapshot = PublicArticleSnapshot.model_validate(version.snapshot)
    except Exception:
        return False
    return snapshot_checksum(snapshot) == version.content_checksum


async def _lock_fact_check(session: AsyncSession, fact_check_id: uuid.UUID) -> FactCheck:
    result = await session.execute(
        select(FactCheck)
        .where(FactCheck.id == fact_check_id)
        .options(selectinload(FactCheck.contents))
        .with_for_update()
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return row


async def _active_approval_review(
    session: AsyncSession,
    *,
    content_id: uuid.UUID,
    revision_id: uuid.UUID,
) -> Review | None:
    return await session.scalar(
        select(Review).where(
            Review.fact_check_content_id == content_id,
            Review.revision_id == revision_id,
            Review.decision == ReviewDecision.APPROVE,
            Review.invalidated_at.is_(None),
        )
    )


async def _next_version_number(session: AsyncSession, *, content_id: uuid.UUID) -> int:
    current_max = await session.scalar(
        select(func.max(ArticleVersion.version_number)).where(
            ArticleVersion.fact_check_content_id == content_id
        )
    )
    return int(current_max or 0) + 1


async def _build_public_snapshot(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    content: FactCheckContent,
    kind: ArticleVersionKind,
    correction_note: str | None,
    published_at: datetime,
    withdrawal_notice: str | None = None,
) -> PublicArticleSnapshot:
    if not fact_check.public_slug:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "missing_public_slug", "message": "public_slug is required"},
        )
    if content.verdict is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "missing_verdict", "message": "verdict is required"},
        )

    ordered_links = sorted(content.source_links, key=lambda link: link.position)
    sources: list[PublicSnapshotSource] = []
    for link in ordered_links:
        source = link.source
        if source is None:
            await session.refresh(link, attribute_names=["source"])
            source = link.source
        sources.append(
            PublicSnapshotSource(
                title=source.title,
                publisher=source.publisher,
                url=source.url,
                published_at=source.published_at,
                relevance_note=link.relevance_note,
            )
        )

    analysis_md = content.analysis_markdown or ""
    limitations_md = content.limitations_markdown or ""
    topic_slugs = await topic_slugs_for_fact_check(session, fact_check_id=fact_check.id)
    return PublicArticleSnapshot(
        schema_version=2,
        language=LanguageCode(content.language.value),
        public_slug=fact_check.public_slug,
        title=content.title or "",
        summary=content.summary,
        claim_text=content.claim_text or "",
        context_text=content.context_text or "",
        verdict=content.verdict,
        verdict_explanation=content.verdict_explanation or "",
        analysis_markdown=analysis_md,
        analysis_html=render_sanitized_html(analysis_md),
        limitations_markdown=limitations_md,
        limitations_html=render_sanitized_html(limitations_md),
        sources=sources,
        topics=topic_slugs,
        translation_status=content.translation_status,
        attribution=PUBLICATION_ATTRIBUTION,
        kind=kind,
        correction_note=correction_note,
        withdrawal_notice=withdrawal_notice,
        published_at=published_at,
    )


async def publish_language(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    language: str,
    actor: User,
    body: PublishRequest,
) -> PublishResponse:
    content = await _load_locked_content(session, fact_check_id=fact_check.id, language=language)
    await _lock_fact_check(session, fact_check.id)
    investigation = content.fact_check.investigation
    if investigation is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    if content.editorial_status != LanguageEditorialStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "not_approved",
                "message": "Language version must be approved before publication",
            },
        )

    revision = await _revision_for_number(
        session,
        content_id=content.id,
        revision_number=content.current_revision_number,
    )
    if revision is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "no_revision", "message": "No revision exists to publish"},
        )

    approval = await _active_approval_review(
        session,
        content_id=content.id,
        revision_id=revision.id,
    )
    if approval is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "no_approval", "message": "No active approval for this revision"},
        )

    try:
        assert_is_approving_reviewer(actor, approving_reviewer_id=approval.reviewer_id)
    except TransitionBlockedError as exc:
        raise http_conflict_from_guard(exc) from exc

    if approval.revision_id != revision.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "approval_revision_mismatch", "message": "Approval revision mismatch"},
        )

    expected_checksum = _revision_checksum(_revision_fields_snapshot(content))
    if revision.checksum != expected_checksum:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "checksum_mismatch",
                "message": "Draft checksum does not match the approved revision",
            },
        )

    issues = await check_readiness(
        session,
        fact_check=content.fact_check,
        content=content,
        investigation=investigation,
    )
    if issues:
        await record_audit_event(
            session,
            event_type=AuditEventType.READINESS_BLOCKED,
            actor_user_id=actor.id,
            subject_type="fact_check_content",
            subject_id=content.id,
            payload={"action": "publish", "issues": issues},
        )
        raise _readiness_http_exception(issues)

    version_count = await session.scalar(
        select(func.count())
        .select_from(ArticleVersion)
        .where(ArticleVersion.fact_check_content_id == content.id)
    )
    is_first_publication = int(version_count or 0) == 0
    if is_first_publication:
        kind = ArticleVersionKind.INITIAL
        correction_note = None
    else:
        kind = content.pending_version_kind or ArticleVersionKind.CORRECTION
        correction_note = (body.correction_note or "").strip()
        if not correction_note:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "correction_note_required",
                    "message": "correction_note is required when publishing an update",
                },
            )

    published_at = datetime.now(UTC)
    snapshot = await _build_public_snapshot(
        session,
        fact_check=content.fact_check,
        content=content,
        kind=kind,
        correction_note=correction_note,
        published_at=published_at,
    )
    checksum = snapshot_checksum(snapshot)
    version_number = await _next_version_number(session, content_id=content.id)

    version = ArticleVersion(
        fact_check_content_id=content.id,
        fact_check_id=content.fact_check_id,
        language=_language_code(content.language.value),
        revision_id=revision.id,
        version_number=version_number,
        kind=kind,
        correction_note=correction_note,
        approval_review_id=approval.id,
        snapshot=snapshot.model_dump(mode="json"),
        published_at=published_at,
        published_by_id=actor.id,
        content_checksum=checksum,
    )
    session.add(version)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "publish_conflict",
                "message": "Another publication request created this version first",
            },
        ) from exc

    content.live_version_id = version.id
    content.published_at = published_at
    content.pending_version_kind = None

    if content.fact_check.published_at is None:
        content.fact_check.published_at = published_at

    try:
        await apply_transition(
            session,
            subject=TransitionSubject.LANGUAGE_CONTENT,
            entity_id=content.id,
            to_status=LanguageEditorialStatus.PUBLISHED,
            actor=actor,
        )
    except InvalidTransitionError as exc:
        raise http_conflict_from_transition(exc) from exc

    await upsert_public_article(session, content=content, version=version, snapshot=snapshot)

    await record_audit_event(
        session,
        event_type=AuditEventType.FACTCHECK_PUBLISHED,
        actor_user_id=actor.id,
        subject_type="fact_check_content",
        subject_id=content.id,
        payload={
            "language": content.language.value,
            "version_number": version_number,
            "kind": kind.value,
            "content_checksum": checksum,
        },
    )
    await session.flush()
    return PublishResponse(
        editorial_status=LanguageEditorialStatus.PUBLISHED,
        version_number=version_number,
        content_checksum=checksum,
    )


async def start_correction(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    language: str,
    actor: User,
    body: CorrectionStartRequest,
) -> DraftResponse:
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "reason_required", "message": "reason is required"},
        )
    content = await _load_locked_content(session, fact_check_id=fact_check.id, language=language)

    if content.editorial_status != LanguageEditorialStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "not_published",
                "message": "Corrections can only start from a published language version",
            },
        )

    now = datetime.now(UTC)
    try:
        await apply_transition(
            session,
            subject=TransitionSubject.LANGUAGE_CONTENT,
            entity_id=content.id,
            to_status=LanguageEditorialStatus.DRAFT,
            actor=actor,
            reason=reason,
        )
    except InvalidTransitionError as exc:
        raise http_conflict_from_transition(exc) from exc

    content.cycle_started_at = now
    content.pending_version_kind = body.kind
    await record_audit_event(
        session,
        event_type=AuditEventType.FACTCHECK_CORRECTION_STARTED,
        actor_user_id=actor.id,
        subject_type="fact_check_content",
        subject_id=content.id,
        payload={
            "language": content.language.value,
            "kind": body.kind.value,
            "reason": reason,
        },
    )
    await session.flush()
    await session.refresh(content, attribute_names=["editorial_status", "source_links"])
    return _draft_response(content)


async def withdraw_language(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    language: str,
    actor: User,
    body: WithdrawRequest,
) -> DraftResponse:
    public_notice = body.public_notice.strip()
    internal_reason = body.internal_reason.strip()
    if not public_notice or not internal_reason:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "reason_required",
                "message": "public_notice and internal_reason required",
            },
        )

    content = await _load_locked_content(session, fact_check_id=fact_check.id, language=language)
    live_version_id = content.live_version_id
    await _lock_fact_check(session, fact_check.id)
    await session.refresh(content, attribute_names=["editorial_status", "live_version_id"])

    if content.editorial_status != LanguageEditorialStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "not_published",
                "message": "Only published language versions can be withdrawn",
            },
        )

    resolved_live_id = content.live_version_id or live_version_id
    live = None
    if resolved_live_id is not None:
        live = await session.get(ArticleVersion, resolved_live_id)
    if live is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "no_live_version", "message": "Published content has no live version"},
        )

    published_at = datetime.now(UTC)
    snapshot = await _build_public_snapshot(
        session,
        fact_check=content.fact_check,
        content=content,
        kind=ArticleVersionKind.WITHDRAWAL,
        correction_note=None,
        published_at=published_at,
        withdrawal_notice=public_notice,
    )
    checksum = snapshot_checksum(snapshot)
    version_number = await _next_version_number(session, content_id=content.id)

    version = ArticleVersion(
        fact_check_content_id=content.id,
        fact_check_id=content.fact_check_id,
        language=_language_code(content.language.value),
        revision_id=live.revision_id,
        version_number=version_number,
        kind=ArticleVersionKind.WITHDRAWAL,
        correction_note=None,
        approval_review_id=live.approval_review_id,
        snapshot=snapshot.model_dump(mode="json"),
        published_at=published_at,
        published_by_id=actor.id,
        content_checksum=checksum,
    )
    session.add(version)
    await session.flush()

    content.live_version_id = version.id
    content.withdrawn_at = published_at

    try:
        await apply_transition(
            session,
            subject=TransitionSubject.LANGUAGE_CONTENT,
            entity_id=content.id,
            to_status=LanguageEditorialStatus.WITHDRAWN,
            actor=actor,
            reason=internal_reason,
        )
    except InvalidTransitionError as exc:
        raise http_conflict_from_transition(exc) from exc

    await upsert_public_article(session, content=content, version=version, snapshot=snapshot)

    await record_audit_event(
        session,
        event_type=AuditEventType.FACTCHECK_WITHDRAWN,
        actor_user_id=actor.id,
        subject_type="fact_check_content",
        subject_id=content.id,
        payload={
            "language": content.language.value,
            "version_number": version_number,
            "public_notice": public_notice,
        },
    )
    await session.flush()
    await session.refresh(content, attribute_names=["editorial_status", "source_links"])
    return _draft_response(content)


async def list_article_versions(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    language: str,
) -> ArticleVersionListResponse:
    content = await session.scalar(
        select(FactCheckContent).where(
            FactCheckContent.fact_check_id == fact_check.id,
            FactCheckContent.language == _language_code(language),
        )
    )
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    rows = (
        await session.execute(
            select(ArticleVersion)
            .where(ArticleVersion.fact_check_content_id == content.id)
            .order_by(ArticleVersion.version_number.asc())
        )
    ).scalars().all()
    items = [
        ArticleVersionSummaryResponse(
            version_number=row.version_number,
            kind=row.kind,
            published_at=row.published_at,
            content_checksum=row.content_checksum,
            checksum_valid=verify_snapshot_checksum(row),
        )
        for row in rows
    ]
    return ArticleVersionListResponse(items=items)


async def get_article_version(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    language: str,
    version_number: int,
) -> ArticleVersionDetailResponse:
    content = await session.scalar(
        select(FactCheckContent).where(
            FactCheckContent.fact_check_id == fact_check.id,
            FactCheckContent.language == _language_code(language),
        )
    )
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    version = await session.scalar(
        select(ArticleVersion).where(
            ArticleVersion.fact_check_content_id == content.id,
            ArticleVersion.version_number == version_number,
        )
    )
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    snapshot = PublicArticleSnapshot.model_validate(version.snapshot)
    return ArticleVersionDetailResponse(
        version_number=version.version_number,
        kind=version.kind,
        published_at=version.published_at,
        content_checksum=version.content_checksum,
        checksum_valid=verify_snapshot_checksum(version),
        snapshot=snapshot,
    )
