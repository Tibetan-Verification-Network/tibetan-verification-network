"""Readiness rules and editorial thresholds."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.editorial_rules import MIN_PUBLIC_SOURCES
from app.db.enums import LanguageCode, PublicVerdict, WorkflowStatus
from app.models.publication import FactCheck, FactCheckContent, FactCheckContentSource
from app.models.research import EvidenceItem, Source
from app.workflow.readiness import check_readiness, translation_status_issues
from tests.factories import make_investigation, make_user


@pytest.mark.usefixtures("db_session")
async def test_min_public_sources_constant(db_session: AsyncSession) -> None:
    assert MIN_PUBLIC_SOURCES == 1


@pytest.mark.usefixtures("db_session")
async def test_readiness_flags_missing_fields_and_unverified_evidence(
    db_session: AsyncSession,
) -> None:
    actor = await make_user(db_session)
    investigation = await make_investigation(db_session, owner=actor)
    fact_check = FactCheck(
        investigation_id=investigation.id,
        public_slug=None,
        workflow_status=WorkflowStatus.DRAFTING,
    )
    content = FactCheckContent(language=LanguageCode.EN)
    fact_check.contents = [content]
    db_session.add(fact_check)
    await db_session.flush()

    source = Source(investigation_id=investigation.id, title="Source A", created_by_id=actor.id)
    db_session.add(source)
    await db_session.flush()
    db_session.add(
        FactCheckContentSource(content_id=content.id, source_id=source.id, position=0)
    )
    db_session.add(
        EvidenceItem(
            investigation_id=investigation.id,
            source_id=source.id,
            excerpt="Quote",
            created_by_id=actor.id,
        )
    )
    await db_session.flush()
    await db_session.refresh(content, attribute_names=["source_links"])
    await db_session.refresh(fact_check, attribute_names=["contents"])

    issues = await check_readiness(
        db_session,
        fact_check=fact_check,
        content=content,
        investigation=investigation,
    )
    assert "missing_title" in issues
    assert "missing_public_slug" in issues
    assert "evidence_not_verified" in issues


def test_translation_status_pending_while_sibling_published() -> None:
    from app.db.enums import LanguageEditorialStatus, TranslationStatus

    sibling = FactCheckContent(
        language=LanguageCode.BO,
        editorial_status=LanguageEditorialStatus.PUBLISHED,
    )
    content = FactCheckContent(
        language=LanguageCode.EN,
        translation_status=TranslationStatus.PENDING,
    )
    issues = translation_status_issues(content, sibling)
    assert "translation_status_pending_while_sibling_published" in issues
