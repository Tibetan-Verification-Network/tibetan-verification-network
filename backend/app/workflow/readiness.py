"""Publication readiness checks for a language draft."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.editorial_rules import MIN_PUBLIC_SOURCES
from app.core.markdown import render_sanitized_html
from app.db.enums import LanguageEditorialStatus, TranslationStatus, WorkflowStatus
from app.models.publication import FactCheck, FactCheckContent
from app.models.research import EvidenceItem, Investigation


def _text_present(value: str | None) -> bool:
    return value is not None and bool(value.strip())


def _markdown_present(value: str | None) -> bool:
    if not _text_present(value):
        return False
    html = render_sanitized_html(value or "")
    return bool(html.strip())


def _sibling_content(fact_check: FactCheck, content: FactCheckContent) -> FactCheckContent | None:
    for row in fact_check.contents:
        if row.id != content.id:
            return row
    return None


def translation_status_issues(
    content: FactCheckContent,
    sibling: FactCheckContent | None,
) -> list[str]:
    if sibling is None:
        return []
    issues: list[str] = []
    if sibling.editorial_status == LanguageEditorialStatus.PUBLISHED:
        if content.translation_status == TranslationStatus.PENDING:
            issues.append("translation_status_pending_while_sibling_published")
    if content.translation_status == TranslationStatus.PUBLISHED:
        if content.editorial_status not in {
            LanguageEditorialStatus.APPROVED,
            LanguageEditorialStatus.PUBLISHED,
        }:
            issues.append("translation_status_published_before_editorial_publication")
    return issues


async def check_readiness(
    session: AsyncSession,
    *,
    fact_check: FactCheck,
    content: FactCheckContent,
    investigation: Investigation,
) -> list[str]:
    """Return stable issue codes; empty list means ready."""
    issues: list[str] = []

    if not _text_present(content.title):
        issues.append("missing_title")
    if not _text_present(content.claim_text):
        issues.append("missing_claim")
    if not _text_present(content.context_text):
        issues.append("missing_context")
    if content.verdict is None:
        issues.append("missing_verdict")
    if not _text_present(content.verdict_explanation):
        issues.append("missing_verdict_explanation")
    if not _markdown_present(content.analysis_markdown):
        issues.append("missing_analysis")
    if not _markdown_present(content.limitations_markdown):
        issues.append("missing_limitations")

    source_count = len(content.source_links)
    if source_count < MIN_PUBLIC_SOURCES:
        issues.append("insufficient_public_sources")

    if investigation.workflow_status in {WorkflowStatus.ON_HOLD, WorkflowStatus.REJECTED}:
        issues.append("investigation_frozen")

    if not _text_present(fact_check.public_slug):
        issues.append("missing_public_slug")

    sibling = _sibling_content(fact_check, content)
    issues.extend(translation_status_issues(content, sibling))

    referenced_source_ids: set[uuid.UUID] = {link.source_id for link in content.source_links}
    if referenced_source_ids:
        rows = (
            await session.execute(
                select(EvidenceItem).where(
                    EvidenceItem.investigation_id == investigation.id,
                    EvidenceItem.source_id.in_(tuple(referenced_source_ids)),
                )
            )
        ).scalars().all()
        for item in rows:
            if item.verified_at is None:
                issues.append("evidence_not_verified")
                break

    return issues
