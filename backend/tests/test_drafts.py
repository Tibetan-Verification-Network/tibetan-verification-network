"""Bilingual drafts, revisions, Markdown safety, and access control."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.markdown import render_sanitized_html
from app.db.enums import LanguageCode as DbLanguageCode
from app.db.enums import LanguageEditorialStatus, RoleCode
from app.models.publication import FactCheckContent
from app.models.research import Source
from app.schemas.common import LanguageCode
from tests.auth_helpers import csrf_headers
from tests.factories import make_investigation, make_user

STRONG_PASSWORD = "correct-horse-battery-staple"

TIBETAN_TITLE = "བོད་ཡིག་གི་ཁ་བྱང་"
ENGLISH_TITLE = "English headline for the fact check"


async def _create_factcheck(
    client: AsyncClient,
    session: dict,
    investigation_id: uuid.UUID,
    *,
    languages: list[str] | None = None,
) -> dict:
    langs = languages or ["bo", "en"]
    response = await client.post(
        f"/api/v1/investigations/{investigation_id}/factcheck",
        json={"languages": langs},
        headers=csrf_headers(session["csrf_token"]),
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.usefixtures("db_session_for_api")
async def test_tibetan_and_english_draft_round_trip(
    as_user,
    db_session_for_api: AsyncSession,
) -> None:
    async with as_user(roles=(RoleCode.RESEARCHER,)) as (client, user, session):
        investigation = await make_investigation(db_session_for_api, owner=user)
        created = await _create_factcheck(client, session, investigation.id)
        fact_check_id = created["id"]

        for lang, title in ((LanguageCode.BO, TIBETAN_TITLE), (LanguageCode.EN, ENGLISH_TITLE)):
            patch = await client.patch(
                f"/api/v1/editorial/factchecks/{fact_check_id}/languages/{lang.value}",
                json={
                    "expected_revision": 0,
                    "title": title,
                    "claim_text": f"Claim in {lang.value}",
                },
                headers=csrf_headers(session["csrf_token"]),
            )
            assert patch.status_code == 200, patch.text
            assert patch.json()["title"] == title
            assert patch.json()["current_revision_number"] == 1

            fetched = await client.get(
                f"/api/v1/editorial/factchecks/{fact_check_id}/languages/{lang.value}",
            )
            assert fetched.status_code == 200
            assert fetched.json()["title"] == title


@pytest.mark.parametrize(
    ("markdown_input", "unsafe_markers"),
    [
        ("<script>alert(1)</script>", ("<script",)),
        ("[x](javascript:alert(1))", ("javascript:",)),
        ('<img src="x" onerror="alert(1)">', ("<img",)),
        ("<p onclick=\"alert(1)\">Hi</p>", ("<p onclick",)),
        ("[data](data:text/html,foo)", ("data:", 'href="data')),
    ],
)
def test_xss_corpus_is_stripped(markdown_input: str, unsafe_markers: tuple[str, ...]) -> None:
    html = render_sanitized_html(markdown_input).lower()
    for marker in unsafe_markers:
        assert marker.lower() not in html


@pytest.mark.usefixtures("db_session_for_api")
async def test_stale_expected_revision_returns_409(
    as_user,
    db_session_for_api: AsyncSession,
) -> None:
    async with as_user(roles=(RoleCode.RESEARCHER,)) as (client, user, session):
        investigation = await make_investigation(db_session_for_api, owner=user)
        created = await _create_factcheck(client, session, investigation.id)
        fact_check_id = created["id"]
        first = await client.patch(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en",
            json={"expected_revision": 0, "title": "First save"},
            headers=csrf_headers(session["csrf_token"]),
        )
        assert first.status_code == 200

        stale = await client.patch(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en",
            json={"expected_revision": 0, "title": "Should fail"},
            headers=csrf_headers(session["csrf_token"]),
        )
        assert stale.status_code == 409
        assert stale.json()["detail"]["code"] == "stale_revision"


@pytest.mark.usefixtures("db_session_for_api")
async def test_edits_in_locked_state_return_409(
    as_user,
    db_session_for_api: AsyncSession,
) -> None:
    async with as_user(roles=(RoleCode.RESEARCHER,)) as (client, user, session):
        investigation = await make_investigation(db_session_for_api, owner=user)
        created = await _create_factcheck(client, session, investigation.id)
        fact_check_id = created["id"]

        content = await db_session_for_api.scalar(
            select(FactCheckContent).where(
                FactCheckContent.fact_check_id == uuid.UUID(fact_check_id),
                FactCheckContent.language == DbLanguageCode.EN,
            )
        )
        assert content is not None
        content.editorial_status = LanguageEditorialStatus.IN_REVIEW
        await db_session_for_api.flush()

        response = await client.patch(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en",
            json={"expected_revision": 0, "title": "Blocked"},
            headers=csrf_headers(session["csrf_token"]),
        )
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "draft_locked"


@pytest.mark.usefixtures("db_session_for_api")
async def test_cross_investigation_source_references_return_422(
    as_user,
    db_session_for_api: AsyncSession,
) -> None:
    async with as_user(roles=(RoleCode.RESEARCHER,)) as (client, user, session):
        inv_a = await make_investigation(db_session_for_api, owner=user)
        other = await make_user(db_session_for_api, roles=(RoleCode.RESEARCHER,))
        inv_b = await make_investigation(db_session_for_api, owner=other)
        foreign_source = Source(
            investigation_id=inv_b.id,
            title="Foreign",
            created_by_id=other.id,
        )
        db_session_for_api.add(foreign_source)
        await db_session_for_api.flush()
        created = await _create_factcheck(client, session, inv_a.id)
        fact_check_id = created["id"]
        response = await client.put(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/sources",
            json={"items": [{"source_id": str(foreign_source.id), "position": 0}]},
            headers=csrf_headers(session["csrf_token"]),
        )
        assert response.status_code == 422


@pytest.mark.usefixtures("db_session_for_api")
async def test_revision_authorship_is_tracked(
    as_user,
    db_session_for_api: AsyncSession,
) -> None:
    async with as_user(roles=(RoleCode.RESEARCHER,)) as (client, user, session):
        investigation = await make_investigation(db_session_for_api, owner=user)
        created = await _create_factcheck(client, session, investigation.id)
        fact_check_id = created["id"]
        await client.patch(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en",
            json={"expected_revision": 0, "title": "Authored"},
            headers=csrf_headers(session["csrf_token"]),
        )
        revisions = await client.get(
            f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/revisions",
        )
        assert revisions.status_code == 200
        items = revisions.json()["items"]
        assert len(items) == 1
        assert items[0]["created_by_id"] == str(user.id)


@pytest.mark.usefixtures("db_session_for_api")
async def test_unassigned_researcher_receives_404(
    as_user,
    db_session_for_api: AsyncSession,
) -> None:
    async with as_user(roles=(RoleCode.RESEARCHER,)) as (client, owner, owner_session):
        investigation = await make_investigation(db_session_for_api, owner=owner)
        created = await _create_factcheck(client, owner_session, investigation.id)
        fact_check_id = created["id"]

    async with as_user(roles=(RoleCode.RESEARCHER,)) as (client, _foreign, _session):
        response = await client.get(f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en")
        assert response.status_code == 404
