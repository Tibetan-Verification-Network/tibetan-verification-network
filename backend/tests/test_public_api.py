"""Public read API: 404 boundaries, search, withdrawal, and field leaks."""

from __future__ import annotations

import json
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import RoleCode
from tests.auth_helpers import csrf_headers, login
from tests.factories import make_investigation, make_user
from tests.security.test_phase3_gate import (
    FORBIDDEN_SNAPSHOT_KEYS,
    STRONG_PASSWORD,
    _create_factcheck,
    _prepare_publishable_draft,
)

CANARY = "CANARY-LEAK-9f3a2b1c"


@pytest.mark.usefixtures("db_session_for_api")
async def test_unpublished_slug_is_404(
    api_client_factory,
    db_session_for_api: AsyncSession,
) -> None:
    author = await make_user(db_session_for_api, roles=(RoleCode.RESEARCHER,))
    async with api_client_factory() as client:
        author_session = await login(client, email=author.email, password=STRONG_PASSWORD)
        investigation = await make_investigation(db_session_for_api, owner=author)
        created = await _create_factcheck(client, author_session, investigation.id)
        slug = f"draft-only-{uuid.uuid4().hex[:8]}"
        slug_resp = await client.patch(
            f"/api/v1/editorial/factchecks/{created['id']}",
            json={"public_slug": slug},
            headers=csrf_headers(author_session["csrf_token"]),
        )
        assert slug_resp.status_code == 200, slug_resp.text
        public = await client.get(f"/api/v1/factchecks/{slug}?lang=en")
        assert public.status_code == 404


async def _full_publish(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    language: str = "en",
) -> tuple[str, uuid.UUID, object]:
    author = await make_user(db_session, roles=(RoleCode.RESEARCHER,))
    editor = await make_user(db_session, roles=(RoleCode.EDITOR,))
    approver = await make_user(db_session, roles=(RoleCode.APPROVER,))
    author_session = await login(client, email=author.email, password=STRONG_PASSWORD)
    investigation = await make_investigation(db_session, owner=author)
    created = await _create_factcheck(client, author_session, investigation.id)
    fact_check_id = uuid.UUID(created["id"])
    revision = await _prepare_publishable_draft(
        client,
        author_session,
        db_session,
        investigation_id=investigation.id,
        fact_check_id=fact_check_id,
        author_id=author.id,
        language=language,
    )
    await client.post(
        f"/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/submit-for-review",
        headers=csrf_headers(author_session["csrf_token"]),
    )
    editor_session = await login(client, email=editor.email, password=STRONG_PASSWORD)
    assigned = await client.post(
        f"/api/v1/investigations/{investigation.id}/assignments",
        json={"user_id": str(approver.id), "assignment_role": "contributor"},
        headers=csrf_headers(editor_session["csrf_token"]),
    )
    assert assigned.status_code == 200, assigned.text
    await client.post(
        f"/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/mark-ready",
        headers=csrf_headers(editor_session["csrf_token"]),
    )
    approver_session = await login(client, email=approver.email, password=STRONG_PASSWORD)
    await client.post(
        f"/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/approve",
        json={"expected_revision": revision},
        headers=csrf_headers(approver_session["csrf_token"]),
    )
    detail = await client.get(
        f"/api/v1/editorial/factchecks/{fact_check_id}",
        headers=csrf_headers(editor_session["csrf_token"]),
    )
    assert detail.status_code == 200, detail.text
    slug = detail.json()["fact_check"]["public_slug"]
    assert slug
    published = await client.post(
        f"/api/v1/editorial/factchecks/{fact_check_id}/languages/{language}/publish",
        json={},
        headers=csrf_headers(approver_session["csrf_token"]),
    )
    assert published.status_code == 200, published.text
    return slug, fact_check_id, approver


@pytest.mark.usefixtures("db_session_for_api")
async def test_publish_enables_public_read_without_bo(
    api_client_factory,
    db_session_for_api: AsyncSession,
) -> None:
    async with api_client_factory() as client:
        slug, _, _ = await _full_publish(client, db_session_for_api, language="en")
        en = await client.get(f"/api/v1/factchecks/{slug}?lang=en")
        assert en.status_code == 200
        assert en.headers.get("etag")
        assert en.headers.get("cache-control", "").startswith("public,")
        bo = await client.get(f"/api/v1/factchecks/{slug}?lang=bo")
        assert bo.status_code == 404
        listed = await client.get("/api/v1/factchecks?lang=en")
        assert listed.status_code == 200
        assert any(item["slug"] == slug for item in listed.json()["items"])


@pytest.mark.usefixtures("db_session_for_api")
async def test_withdrawn_removed_from_list_but_detail_shows_notice(
    api_client_factory,
    db_session_for_api: AsyncSession,
) -> None:
    async with api_client_factory() as client:
        slug, fact_check_id, approver = await _full_publish(
            client, db_session_for_api, language="en"
        )
        approver_session = await login(client, email=approver.email, password=STRONG_PASSWORD)
        withdrawn = await client.post(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/withdraw",
            json={
                "public_notice": "Withdrawn for review.",
                "internal_reason": "Needs re-check",
            },
            headers=csrf_headers(approver_session["csrf_token"]),
        )
        assert withdrawn.status_code == 200, withdrawn.text
        listed = await client.get("/api/v1/factchecks?lang=en")
        assert all(item["slug"] != slug for item in listed.json()["items"])
        detail = await client.get(f"/api/v1/factchecks/{slug}?lang=en")
        assert detail.status_code == 200
        assert detail.json()["snapshot"]["withdrawal_notice"] == "Withdrawn for review."


@pytest.mark.usefixtures("db_session_for_api")
async def test_public_responses_exclude_internal_canaries(
    api_client_factory,
    db_session_for_api: AsyncSession,
) -> None:
    async with api_client_factory() as client:
        slug, _, _ = await _full_publish(client, db_session_for_api, language="en")
        endpoints = [
            f"/api/v1/factchecks/{slug}?lang=en",
            f"/api/v1/factchecks/{slug}/versions/1?lang=en",
            "/api/v1/factchecks?lang=en",
            "/api/v1/topics",
        ]
        for path in endpoints:
            response = await client.get(path)
            assert response.status_code == 200, path
            blob = json.dumps(response.json()).lower()
            for key in FORBIDDEN_SNAPSHOT_KEYS:
                assert key not in blob
            assert CANARY.lower() not in blob
