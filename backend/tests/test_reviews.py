"""Review workflow, independence guards, and approval concurrency."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import (
    LanguageCode,
    LanguageEditorialStatus,
    PublicVerdict,
    ReviewDecision,
    RoleCode,
    TranslationStatus,
    WorkflowStatus,
)
from app.models.publication import (
    FactCheck,
    FactCheckContent,
    FactCheckContentRevision,
    FactCheckContentSource,
    Review,
)
from app.models.research import EvidenceItem, Source
from app.schemas.factchecks import ApproveRequest
from app.services.reviews import approve_language
from tests.auth_helpers import csrf_headers, login
from tests.factories import make_investigation, make_user

STRONG_PASSWORD = "correct-horse-battery-staple"


async def _create_factcheck(client: AsyncClient, session: dict, investigation_id: uuid.UUID) -> dict:
    response = await client.post(
        f"/api/v1/investigations/{investigation_id}/factcheck",
        json={"languages": ["en"]},
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
) -> int:
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
        f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en",
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
        f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/sources",
        json={
            "items": [
                {"source_id": str(source.id), "relevance_note": "Primary", "position": 0},
            ],
        },
        headers=headers,
    )
    assert sources.status_code == 200, sources.text
    return sources.json()["current_revision_number"]


@pytest.mark.usefixtures("db_session_for_api")
async def test_self_approval_and_ready_editor_cannot_approve(
    as_user,
    api_client_factory,
    db_session_for_api: AsyncSession,
) -> None:
    author = await make_user(
        db_session_for_api,
        roles=(RoleCode.RESEARCHER, RoleCode.EDITOR, RoleCode.APPROVER),
    )
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
        submit = await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/submit-for-review",
            headers=csrf_headers(author_session["csrf_token"]),
        )
        assert submit.status_code == 200, submit.text

        editor_session = await login(client, email=editor.email, password=STRONG_PASSWORD)
        ready = await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/mark-ready",
            headers=csrf_headers(editor_session["csrf_token"]),
        )
        assert ready.status_code == 200, ready.text

    async with api_client_factory() as client:
        author_session = await login(client, email=author.email, password=STRONG_PASSWORD)
        self_approve = await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/approve",
            json={"expected_revision": revision},
            headers=csrf_headers(author_session["csrf_token"]),
        )
        assert self_approve.status_code == 409
        assert self_approve.json()["detail"]["code"] == "is_author"

    async with api_client_factory() as client:
        editor_session = await login(client, email=editor.email, password=STRONG_PASSWORD)
        editor_approve = await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/approve",
            json={"expected_revision": revision},
            headers=csrf_headers(editor_session["csrf_token"]),
        )
        assert editor_approve.status_code == 404

    async with api_client_factory() as client:
        approver_session = await login(client, email=approver.email, password=STRONG_PASSWORD)
        ok = await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/approve",
            json={"expected_revision": revision},
            headers=csrf_headers(approver_session["csrf_token"]),
        )
        assert ok.status_code == 200, ok.text


@pytest.mark.usefixtures("db_session_for_api")
async def test_after_approval_edit_blocked_and_reopen_invalidates(
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
        approved = await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/approve",
            json={"expected_revision": revision},
            headers=csrf_headers(approver_session["csrf_token"]),
        )
        assert approved.status_code == 200
        assert approved.json()["editorial_status"] == LanguageEditorialStatus.APPROVED.value

    async with api_client_factory() as client:
        author_session = await login(client, email=author.email, password=STRONG_PASSWORD)
        locked = await client.patch(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en",
            json={"expected_revision": revision, "title": "Changed"},
            headers=csrf_headers(author_session["csrf_token"]),
        )
        assert locked.status_code == 409
        assert locked.json()["detail"]["code"] == "draft_locked"

        reopen = await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/reopen",
            json={"reason": "Need a material fix"},
            headers=csrf_headers(author_session["csrf_token"]),
        )
        assert reopen.status_code == 200
        assert reopen.json()["editorial_status"] == LanguageEditorialStatus.DRAFT.value

    rows = (
        await db_session_for_api.execute(
            select(Review).where(Review.decision == ReviewDecision.APPROVE)
        )
    ).scalars().all()
    assert rows
    assert all(row.invalidated_at is not None for row in rows)


@pytest.mark.usefixtures("db_session_for_api")
async def test_stale_revision_on_approve_rejected(
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
        stale = await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/approve",
            json={"expected_revision": revision - 1},
            headers=csrf_headers(approver_session["csrf_token"]),
        )
        assert stale.status_code == 409
        assert stale.json()["detail"]["code"] == "stale_revision"


@pytest.mark.usefixtures("db_session_for_api")
async def test_approver_outside_assignment_sees_queue_not_detail(
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
        detail = await client.get(f"/api/v1/editorial/factchecks/{fact_check_id}")
        assert detail.status_code == 200
        queue = await client.get("/api/v1/editorial/approval-queue")
        assert queue.status_code == 200
        assert any(item["fact_check_id"] == fact_check_id for item in queue.json()["items"])
        approve = await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/approve",
            json={"expected_revision": revision},
            headers=csrf_headers(approver_session["csrf_token"]),
        )
        assert approve.status_code == 200


@pytest.mark.usefixtures("db_session")
async def test_concurrent_approvals_yield_one_active_approval(
    db_session: AsyncSession,
) -> None:
    from datetime import UTC, datetime

    author = await make_user(db_session, roles=(RoleCode.RESEARCHER,))
    editor = await make_user(db_session, roles=(RoleCode.EDITOR,))
    approver_a = await make_user(db_session, roles=(RoleCode.APPROVER,))
    approver_b = await make_user(db_session, roles=(RoleCode.APPROVER,))
    investigation = await make_investigation(db_session, owner=author)

    source = Source(
        investigation_id=investigation.id,
        title="Source",
        url="https://example.org/a",
        created_by_id=author.id,
    )
    db_session.add(source)
    await db_session.flush()

    fact_check = FactCheck(
        investigation_id=investigation.id,
        public_slug=f"concurrent-{uuid.uuid4().hex[:8]}",
        workflow_status=WorkflowStatus.IN_REVIEW,
    )
    content = FactCheckContent(
        language=LanguageCode.EN,
        editorial_status=LanguageEditorialStatus.READY_FOR_APPROVAL,
        title="Title",
        claim_text="Claim",
        context_text="Context",
        verdict=PublicVerdict.TRUE,
        verdict_explanation="Explanation",
        analysis_markdown="Analysis",
        limitations_markdown="Limits",
        current_revision_number=1,
        translation_status=TranslationStatus.UNAVAILABLE,
    )
    fact_check.contents = [content]
    db_session.add(fact_check)
    await db_session.flush()
    revision = FactCheckContentRevision(
        content_id=content.id,
        revision_number=1,
        fields={"title": "Title"},
        checksum="abc123",
        created_by_id=author.id,
    )
    db_session.add(revision)
    await db_session.flush()
    db_session.add(
        EvidenceItem(
            investigation_id=investigation.id,
            source_id=source.id,
            excerpt="Quoted",
            verified_at=datetime.now(UTC),
            verified_by_id=author.id,
        )
    )
    db_session.add(
        FactCheckContentSource(content_id=content.id, source_id=source.id, position=0)
    )
    db_session.add(
        Review(
            fact_check_content_id=content.id,
            reviewer_id=editor.id,
            decision=ReviewDecision.MARK_READY,
            revision_id=revision.id,
        )
    )
    await db_session.flush()
    await db_session.refresh(fact_check)

    await approve_language(
        db_session,
        fact_check=fact_check,
        language=LanguageCode.EN.value,
        actor=approver_a,
        body=ApproveRequest(expected_revision=1),
    )

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await approve_language(
            db_session,
            fact_check=fact_check,
            language=LanguageCode.EN.value,
            actor=approver_b,
            body=ApproveRequest(expected_revision=1),
        )
    assert exc_info.value.status_code == 409

    active = (
        await db_session.execute(
            select(Review).where(
                Review.decision == ReviewDecision.APPROVE,
                Review.invalidated_at.is_(None),
            )
        )
    ).scalars().all()
    assert len(active) == 1
