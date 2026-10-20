"""Load published snapshots for anonymous readers."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import LanguageCode, LanguageEditorialStatus, TranslationStatus
from app.models.publication import ArticleVersion, FactCheck, FactCheckContent
from app.schemas.factchecks import PublicArticleSnapshot
from app.schemas.public import (
    PublicFactCheckDetailResponse,
    PublicVersionSummary,
    TranslationLinkState,
)
from app.services.publication import verify_snapshot_checksum


def _language_link(
    content: FactCheckContent | None,
    *,
    slug: str,
    language: LanguageCode,
) -> TranslationLinkState:
    if content is None:
        return TranslationLinkState(language=language.value, status="unavailable")
    lang = content.language.value
    if content.editorial_status in {
        LanguageEditorialStatus.PUBLISHED,
        LanguageEditorialStatus.WITHDRAWN,
    }:
        return TranslationLinkState(language=lang, status="published", slug=slug)
    if content.translation_status == TranslationStatus.PENDING:
        return TranslationLinkState(language=lang, status="pending", slug=slug)
    return TranslationLinkState(language=lang, status="unavailable", slug=slug)


async def get_public_factcheck(
    session: AsyncSession,
    *,
    slug: str,
    language: str,
) -> PublicFactCheckDetailResponse:
    lang = LanguageCode(language)
    content = await session.scalar(
        select(FactCheckContent)
        .join(FactCheck, FactCheck.id == FactCheckContent.fact_check_id)
        .where(FactCheck.public_slug == slug, FactCheckContent.language == lang)
    )
    if content is None or content.live_version_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if content.editorial_status not in {
        LanguageEditorialStatus.PUBLISHED,
        LanguageEditorialStatus.WITHDRAWN,
    }:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    version = await session.get(ArticleVersion, content.live_version_id)
    if version is None or not verify_snapshot_checksum(version):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    snapshot = PublicArticleSnapshot.model_validate(version.snapshot)
    checksum = version.content_checksum

    other_lang = LanguageCode.BO if lang == LanguageCode.EN else LanguageCode.EN
    other_content = await session.scalar(
        select(FactCheckContent).where(
            FactCheckContent.fact_check_id == content.fact_check_id,
            FactCheckContent.language == other_lang,
        )
    )
    translations = [
        _language_link(content, slug=slug, language=lang),
        _language_link(other_content, slug=slug, language=other_lang),
    ]

    versions = (
        await session.execute(
            select(ArticleVersion)
            .where(ArticleVersion.fact_check_content_id == content.id)
            .order_by(ArticleVersion.version_number.asc())
        )
    ).scalars().all()
    version_summaries = [
        PublicVersionSummary(
            version_number=row.version_number,
            kind=row.kind,
            published_at=row.published_at,
            correction_note=row.correction_note,
        )
        for row in versions
    ]

    return PublicFactCheckDetailResponse(
        snapshot=snapshot,
        checksum=checksum,
        translations=translations,
        versions=version_summaries,
    )


async def get_public_factcheck_version(
    session: AsyncSession,
    *,
    slug: str,
    language: str,
    version_number: int,
) -> PublicArticleSnapshot:
    lang = LanguageCode(language)
    content = await session.scalar(
        select(FactCheckContent)
        .join(FactCheck, FactCheck.id == FactCheckContent.fact_check_id)
        .where(FactCheck.public_slug == slug, FactCheckContent.language == lang)
    )
    if content is None or content.live_version_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if content.editorial_status not in {
        LanguageEditorialStatus.PUBLISHED,
        LanguageEditorialStatus.WITHDRAWN,
    }:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    version = await session.scalar(
        select(ArticleVersion).where(
            ArticleVersion.fact_check_content_id == content.id,
            ArticleVersion.version_number == version_number,
        )
    )
    if version is None or not verify_snapshot_checksum(version):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return PublicArticleSnapshot.model_validate(version.snapshot)


def etag_for_checksum(checksum: str) -> str:
    return f'"{checksum}"'
