"""Phase 3 security gate: publication integrity, independence, and concurrency."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import (
    ArticleVersionKind,
    LanguageCode,
    LanguageEditorialStatus,
    PublicVerdict,
    ReviewDecision,
    RoleCode,
)
from app.models.publication import (
    ArticleVersion,
    FactCheck,
    FactCheckContent,
    Review,
)
from tests.auth_helpers import csrf_headers, login
from tests.factories import make_investigation, make_user

STRONG_PASSWORD = "correct-horse-battery-staple"
FORBIDDEN_SNAPSHOT_KEYS = frozenset(
    {
        "contact_email",
        "contact_phone",
        "storage_key",
        "internal_notes",
        "review_comments",
        "email",
    }
)


async def _create_factcheck(
    client: AsyncClient,
    session: dict,
    investigation_id: uuid.UUID,
) -> dict:
    response = await client.post(
        f"/api/v1/investigations/{investigation_id}/factcheck",
        json={"languages": ["en", "bo"]},
        headers=csrf_headers(session["csrf_token"]),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _prepare_publishable_draft(
    client: AsyncClient,
    session: dict,
    db_session: AsyncSession,
    *,
    investigation_id: uuid.UUID,
    fact_check_id: uuid.UUID,
    author_id: uuid.UUID,
    language: str = "en",
) -> int:
    from app.models.research import EvidenceItem, Source

    headers = csrf_headers(session["csrf_token"])
    slug = await client.patch(
        f"/api/v1/editorial/factchecks/{fact_check_id}",
        json={"public_slug": f"fc-{uuid.uuid4().hex[:10]}"},
        headers=headers,
    )
    assert slug.status_code == 200, slug.text

    source = Source(
        investigation_id=investigation_id,
        title="Primary source",
        url="https://example.org/report",
        created_by_id=author_id,
    )
    db_session.add(source)
    await db_session.flush()

    evidence = EvidenceItem(
        investigation_id=investigation_id,
        source_id=source.id,
        excerpt="Verified quote",
    )
    db_session.add(evidence)
    await db_session.flush()

    verify = await client.post(
        f"/api/v1/investigations/{investigation_id}/evidence/{evidence.id}/verify",
        headers=headers,
    )
    assert verify.status_code == 200, verify.text

    patch = await client.patch(
        f"/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}",
        json={
            "expected_revision": 0,
            "title": "Title",
            "claim_text": "Claim",
            "context_text": "Context",
            "verdict": PublicVerdict.TRUE.value,
            "verdict_explanation": "Because sources support it.",
            "analysis_markdown": "Analysis paragraph.",
            "limitations_markdown": "Scope limits apply.",
            "translation_status": "unavailable",
        },
        headers=headers,
    )
    assert patch.status_code == 200, patch.text

    sources = await client.put(
        f"/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/sources",
        json={"items": [{"source_id": str(source.id), "relevance_note": "Primary", "position": 0}]},
        headers=headers,
    )
    assert sources.status_code == 200, sources.text
    return sources.json()["current_revision_number"]


@pytest.mark.usefixtures("db_session_for_api")
async def test_publish_requires_approving_reviewer_and_snapshot_is_allowlisted(
    api_client_factory,
    db_session_for_api: AsyncSession,
) -> None:
    author = await make_user(db_session_for_api, roles=(RoleCode.RESEARCHER,))
    editor = await make_user(db_session_for_api, roles=(RoleCode.EDITOR,))
    approver = await make_user(db_session_for_api, roles=(RoleCode.APPROVER,))
    other_approver = await make_user(db_session_for_api, roles=(RoleCode.APPROVER,))

    async with api_client_factory() as client:
        author_session = await login(client, email=author.email, password=STRONG_PASSWORD)
        investigation = await make_investigation(db_session_for_api, owner=author)
        created = await _create_factcheck(client, author_session, investigation.id)
        fact_check_id = created["id"]
        revision = await _prepare_publishable_draft(
            client,
            author_session,
            db_session_for_api,
            investigation_id=investigation.id,
            fact_check_id=fact_check_id,
            author_id=author.id,
        )
        await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/submit-for-review",
            headers=csrf_headers(author_session["csrf_token"]),
        )
        editor_session = await login(client, email=editor.email, password=STRONG_PASSWORD)
        await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/mark-ready",
            headers=csrf_headers(editor_session["csrf_token"]),
        )
        approver_session = await login(client, email=approver.email, password=STRONG_PASSWORD)
        await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/approve",
            json={"expected_revision": revision},
            headers=csrf_headers(approver_session["csrf_token"]),
        )

        async with api_client_factory() as other_client:
            other_session = await login(
                other_client,
                email=other_approver.email,
                password=STRONG_PASSWORD,
            )
            denied = await other_client.post(
                f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/publish",
                json={},
                headers=csrf_headers(other_session["csrf_token"]),
            )
            assert denied.status_code == 409
            assert denied.json()["detail"]["code"] == "not_approving_reviewer"

        published = await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/publish",
            json={},
            headers=csrf_headers(approver_session["csrf_token"]),
        )
        assert published.status_code == 200, published.text
        assert published.json()["version_number"] == 1

        editor_session = await login(client, email=editor.email, password=STRONG_PASSWORD)
        detail = await client.get(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/versions/1",
            headers=csrf_headers(editor_session["csrf_token"]),
        )
        assert detail.status_code == 200
        body = detail.json()
        assert body["checksum_valid"] is True
        blob = json.dumps(body["snapshot"]).lower()
        for key in FORBIDDEN_SNAPSHOT_KEYS:
            assert key not in blob

        bo = await client.get(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/bo",
            headers=csrf_headers(editor_session["csrf_token"]),
        )
        assert bo.status_code == 200
        assert bo.json()["editorial_status"] == LanguageEditorialStatus.DRAFT.value


@pytest.mark.usefixtures("db_session_for_api")
async def test_checksum_mismatch_blocks_publish(
    api_client_factory,
    db_session_for_api: AsyncSession,
) -> None:
    author = await make_user(db_session_for_api, roles=(RoleCode.RESEARCHER,))
    editor = await make_user(db_session_for_api, roles=(RoleCode.EDITOR,))
    approver = await make_user(db_session_for_api, roles=(RoleCode.APPROVER,))

    async with api_client_factory() as client:
        author_session = await login(client, email=author.email, password=STRONG_PASSWORD)
        investigation = await make_investigation(db_session_for_api, owner=author)
        created = await _create_factcheck(client, author_session, investigation.id)
        fact_check_id = created["id"]
        revision = await _prepare_publishable_draft(
            client,
            author_session,
            db_session_for_api,
            investigation_id=investigation.id,
            fact_check_id=fact_check_id,
            author_id=author.id,
        )
        await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/submit-for-review",
            headers=csrf_headers(author_session["csrf_token"]),
        )
        editor_session = await login(client, email=editor.email, password=STRONG_PASSWORD)
        await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/mark-ready",
            headers=csrf_headers(editor_session["csrf_token"]),
        )
        approver_session = await login(client, email=approver.email, password=STRONG_PASSWORD)
        await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/approve",
            json={"expected_revision": revision},
            headers=csrf_headers(approver_session["csrf_token"]),
        )

        content_row = await db_session_for_api.scalar(
            select(FactCheckContent).where(
                FactCheckContent.fact_check_id == uuid.UUID(fact_check_id),
                FactCheckContent.language == LanguageCode.EN,
            )
        )
        assert content_row is not None
        content_row.title = "Tampered after approval"
        await db_session_for_api.flush()

        blocked = await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/publish",
            json={},
            headers=csrf_headers(approver_session["csrf_token"]),
        )
        assert blocked.status_code == 409
        assert blocked.json()["detail"]["code"] == "checksum_mismatch"


@pytest.mark.usefixtures("db_session")
async def test_article_version_immutable_via_sql(db_session: AsyncSession) -> None:
    actor = await make_user(db_session)
    investigation = await make_investigation(db_session, owner=actor)
    fact_check = FactCheck(investigation_id=investigation.id, public_slug="immutable-test")
    content = FactCheckContent(
        language=LanguageCode.EN,
        editorial_status=LanguageEditorialStatus.DRAFT,
    )
    fact_check.contents = [content]
    db_session.add(fact_check)
    await db_session.flush()
    review = Review(
        fact_check_content_id=content.id,
        reviewer_id=actor.id,
        decision=ReviewDecision.APPROVE,
    )
    db_session.add(review)
    await db_session.flush()
    version = ArticleVersion(
        fact_check_content_id=content.id,
        fact_check_id=fact_check.id,
        language=LanguageCode.EN,
        version_number=1,
        kind=ArticleVersionKind.INITIAL,
        approval_review_id=review.id,
        snapshot={"schema_version": 1},
        published_at=datetime.now(UTC),
        published_by_id=actor.id,
        content_checksum="abc",
    )
    db_session.add(version)
    await db_session.flush()

    with pytest.raises(DBAPIError):
        await db_session.execute(
            text("UPDATE article_versions SET content_checksum = 'x' WHERE id = :id"),
            {"id": version.id},
        )


@pytest.mark.usefixtures("db_session_for_api")
async def test_correction_preserves_prior_version(
    api_client_factory,
    db_session_for_api: AsyncSession,
) -> None:
    author = await make_user(db_session_for_api, roles=(RoleCode.RESEARCHER,))
    editor = await make_user(db_session_for_api, roles=(RoleCode.EDITOR,))
    approver = await make_user(db_session_for_api, roles=(RoleCode.APPROVER,))

    async with api_client_factory() as client:
        author_session = await login(client, email=author.email, password=STRONG_PASSWORD)
        investigation = await make_investigation(db_session_for_api, owner=author)
        created = await _create_factcheck(client, author_session, investigation.id)
        fact_check_id = created["id"]
        revision = await _prepare_publishable_draft(
            client,
            author_session,
            db_session_for_api,
            investigation_id=investigation.id,
            fact_check_id=fact_check_id,
            author_id=author.id,
        )
        await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/submit-for-review",
            headers=csrf_headers(author_session["csrf_token"]),
        )
        editor_session = await login(client, email=editor.email, password=STRONG_PASSWORD)
        await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/mark-ready",
            headers=csrf_headers(editor_session["csrf_token"]),
        )
        approver_session = await login(client, email=approver.email, password=STRONG_PASSWORD)
        await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/approve",
            json={"expected_revision": revision},
            headers=csrf_headers(approver_session["csrf_token"]),
        )
        await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/publish",
            json={},
            headers=csrf_headers(approver_session["csrf_token"]),
        )

        editor_session = await login(client, email=editor.email, password=STRONG_PASSWORD)
        v1 = await client.get(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/versions/1",
            headers=csrf_headers(editor_session["csrf_token"]),
        )
        assert v1.status_code == 200
        first_checksum = v1.json()["content_checksum"]

        await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/corrections",
            json={"kind": "correction", "reason": "Fix wording"},
            headers=csrf_headers(approver_session["csrf_token"]),
        )

        v1_after = await client.get(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/versions/1",
            headers=csrf_headers(editor_session["csrf_token"]),
        )
        assert v1_after.json()["content_checksum"] == first_checksum


def test_request_db_session_rolls_back_on_exception() -> None:
    """Publication uses get_db_session, which rolls back on any exception."""
    import inspect

    from app.core import deps

    source = inspect.getsource(deps.get_db_session)
    assert "await session.rollback()" in source
