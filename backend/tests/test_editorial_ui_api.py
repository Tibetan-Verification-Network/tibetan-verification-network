"""Read endpoints added for the editorial UI, and the permission rules behind each of them."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import InvestigationAssignmentRole, RoleCode
from app.models.publication import ArticleVersion
from tests.auth_helpers import csrf_headers, login
from tests.factories import make_document, make_investigation, make_user
from tests.test_reviews import _create_factcheck, _prepare_publishable_draft

PASSWORD = "correct-horse-battery-staple"


@pytest.mark.usefixtures("db_session_for_api")
async def test_admin_user_list_is_platform_admin_only(as_user) -> None:
    async with as_user(roles=(RoleCode.PLATFORM_ADMINISTRATOR,)) as (client, admin, _):
        response = await client.get("/api/v1/admin/users")
        assert response.status_code == 200, response.text
        rows = {row["id"]: row for row in response.json()["items"]}
        assert rows[str(admin.id)]["roles"] == ["platform_administrator"]
        assert set(rows[str(admin.id)]) == {
            "id",
            "email",
            "display_name",
            "roles",
            "is_active",
            "disabled_at",
        }

    for role in (RoleCode.EDITOR, RoleCode.RESEARCHER, RoleCode.APPROVER):
        async with as_user(roles=(role,)) as (client, _user, _):
            response = await client.get("/api/v1/admin/users")
            assert response.status_code in {403, 404}, role


async def test_admin_user_list_requires_a_session(api_client: AsyncClient) -> None:
    response = await api_client.get("/api/v1/admin/users")
    assert response.status_code == 401


@pytest.mark.usefixtures("db_session_for_api")
async def test_staff_directory_lists_only_active_editorial_staff(
    as_user,
    db_session_for_api: AsyncSession,
) -> None:
    active = await make_user(db_session_for_api, roles=(RoleCode.RESEARCHER,), display_name="Dawa")
    disabled = await make_user(db_session_for_api, roles=(RoleCode.EDITOR,))
    disabled.is_active = False
    admin_only = await make_user(db_session_for_api, roles=(RoleCode.PLATFORM_ADMINISTRATOR,))
    await db_session_for_api.flush()

    async with as_user(roles=(RoleCode.EDITOR,)) as (client, editor, _):
        response = await client.get("/api/v1/editorial/staff")
        assert response.status_code == 200, response.text
        ids = {row["id"] for row in response.json()["items"]}
        assert str(active.id) in ids
        assert str(editor.id) in ids
        assert str(disabled.id) not in ids
        assert str(admin_only.id) not in ids
        for row in response.json()["items"]:
            assert set(row) == {"id", "email", "display_name", "roles"}

    async with as_user(roles=(RoleCode.RESEARCHER,)) as (client, _user, _):
        assert (await client.get("/api/v1/editorial/staff")).status_code == 200

    for role in (RoleCode.APPROVER, RoleCode.PLATFORM_ADMINISTRATOR):
        async with as_user(roles=(role,)) as (client, _user, _):
            assert (await client.get("/api/v1/editorial/staff")).status_code == 404, role


async def test_staff_directory_requires_a_session(api_client: AsyncClient) -> None:
    assert (await api_client.get("/api/v1/editorial/staff")).status_code == 401


@pytest.mark.usefixtures("db_session_for_api")
async def test_lists_carry_the_labels_the_ui_needs(
    api_client_factory,
    db_session_for_api: AsyncSession,
) -> None:
    author = await make_user(db_session_for_api, roles=(RoleCode.RESEARCHER,))
    investigation = await make_investigation(db_session_for_api, owner=author)
    async with api_client_factory() as client:
        session = await login(client, email=author.email, password=PASSWORD)

        before = await client.get(f"/api/v1/investigations/{investigation.id}")
        assert before.json()["fact_check_id"] is None

        created = await _create_factcheck(client, session, investigation.id)
        await client.patch(
            f"/api/v1/editorial/factchecks/{created['id']}/languages/en",
            json={"expected_revision": 0, "title": "A headline"},
            headers=csrf_headers(session["csrf_token"]),
        )

        after = await client.get(f"/api/v1/investigations/{investigation.id}")
        assert after.json()["fact_check_id"] == created["id"]

        listing = await client.get("/api/v1/investigations")
        row = next(item for item in listing.json()["items"] if item["id"] == str(investigation.id))
        assert row["claim_text"] == "Canonical claim text"

        by_claim = await client.get(
            "/api/v1/investigations", params={"claim_id": str(investigation.claim_id)}
        )
        assert [item["id"] for item in by_claim.json()["items"]] == [str(investigation.id)]
        elsewhere = await client.get(
            "/api/v1/investigations", params={"claim_id": str(uuid.uuid4())}
        )
        assert elsewhere.json()["items"] == []

        fact_checks = await client.get("/api/v1/editorial/factchecks")
        item = fact_checks.json()["items"][0]
        assert item["id"] == created["id"]
        assert item["languages"] == [
            {"language": "en", "editorial_status": "draft", "title": "A headline"}
        ]

        detail = await client.get(f"/api/v1/editorial/factchecks/{created['id']}")
        content_ids = [lang["content_id"] for lang in detail.json()["languages"]]
        assert len(content_ids) == 1
        uuid.UUID(content_ids[0])


@pytest.mark.usefixtures("db_session_for_api")
async def test_review_thread_and_fact_check_topics_follow_view_access(
    api_client_factory,
    db_session_for_api: AsyncSession,
) -> None:
    author = await make_user(db_session_for_api, roles=(RoleCode.RESEARCHER,))
    editor = await make_user(db_session_for_api, roles=(RoleCode.EDITOR,))
    stranger = await make_user(db_session_for_api, roles=(RoleCode.RESEARCHER,))
    investigation = await make_investigation(db_session_for_api, owner=author)

    async with api_client_factory() as author_client:
        author_session = await login(author_client, email=author.email, password=PASSWORD)
        created = await _create_factcheck(author_client, author_session, investigation.id)
        base = f"/api/v1/editorial/factchecks/{created['id']}"

        async with api_client_factory() as editor_client:
            editor_session = await login(editor_client, email=editor.email, password=PASSWORD)
            posted = await editor_client.post(
                f"{base}/languages/en/reviews",
                json={"comments": "Please add the second source."},
                headers=csrf_headers(editor_session["csrf_token"]),
            )
            assert posted.status_code == 200, posted.text

            for client in (author_client, editor_client):
                thread = await client.get(f"{base}/languages/en/reviews")
                assert thread.status_code == 200, thread.text
                items = thread.json()["items"]
                assert [row["comments"] for row in items] == ["Please add the second source."]
                assert items[0]["decision"] == "comment"
                topics = await client.get(f"{base}/topics")
                assert topics.status_code == 200
                assert topics.json() == {"items": []}

        async with api_client_factory() as stranger_client:
            await login(stranger_client, email=stranger.email, password=PASSWORD)
            assert (await stranger_client.get(f"{base}/languages/en/reviews")).status_code == 404
            assert (await stranger_client.get(f"{base}/topics")).status_code == 404

        # An unknown fact check answers exactly like one the caller may not see.
        ghost = f"/api/v1/editorial/factchecks/{uuid.uuid4()}"
        assert (await author_client.get(f"{ghost}/languages/en/reviews")).status_code == 404


@pytest.mark.usefixtures("db_session_for_api")
async def test_publish_preview_is_read_only_and_approver_only(
    api_client_factory,
    db_session_for_api: AsyncSession,
) -> None:
    author = await make_user(
        db_session_for_api,
        roles=(RoleCode.RESEARCHER, RoleCode.EDITOR),
    )
    approver = await make_user(db_session_for_api, roles=(RoleCode.APPROVER,))
    investigation = await make_investigation(
        db_session_for_api,
        owner=author,
        assigned=[(approver, InvestigationAssignmentRole.CONTRIBUTOR)],
    )

    async with api_client_factory() as author_client:
        author_session = await login(author_client, email=author.email, password=PASSWORD)
        created = await _create_factcheck(author_client, author_session, investigation.id)
        fact_check_id = created["id"]
        revision = await _prepare_publishable_draft(
            author_client,
            author_session,
            db_session_for_api,
            investigation_id=investigation.id,
            fact_check_id=fact_check_id,
            author_id=author.id,
        )
        url = f"/api/v1/editorial/factchecks/{fact_check_id}/languages/en/publish-preview"

        # The author is an editor and researcher, but publishing is the approver's action.
        assert (await author_client.get(url)).status_code == 404

        async with api_client_factory() as approver_client:
            await login(approver_client, email=approver.email, password=PASSWORD)
            response = await approver_client.get(url)
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["kind"] == "initial"
            assert body["revision_number"] == revision
            assert body["correction_note_required"] is False
            assert body["readiness_issues"] == []
            snapshot = body["snapshot"]
            assert snapshot["title"] == "Title"
            assert snapshot["schema_version"] == 2
            assert snapshot["sources"][0]["title"] == "Primary source"
            assert "analysis_html" in snapshot

        versions = await db_session_for_api.scalar(select(func.count()).select_from(ArticleVersion))
        assert versions == 0


@pytest.mark.usefixtures("db_session_for_api")
async def test_publish_preview_reports_missing_pieces_instead_of_a_snapshot(
    api_client_factory,
    db_session_for_api: AsyncSession,
) -> None:
    author = await make_user(db_session_for_api, roles=(RoleCode.RESEARCHER,))
    approver = await make_user(db_session_for_api, roles=(RoleCode.APPROVER,))
    investigation = await make_investigation(
        db_session_for_api,
        owner=author,
        assigned=[(approver, InvestigationAssignmentRole.CONTRIBUTOR)],
    )
    async with api_client_factory() as author_client:
        session = await login(author_client, email=author.email, password=PASSWORD)
        created = await _create_factcheck(author_client, session, investigation.id)
        async with api_client_factory() as approver_client:
            await login(approver_client, email=approver.email, password=PASSWORD)
            response = await approver_client.get(
                f"/api/v1/editorial/factchecks/{created['id']}/languages/en/publish-preview"
            )
            assert response.status_code == 409
            assert response.json()["detail"]["code"] == "missing_public_slug"


@pytest.mark.usefixtures("db_session_for_api")
async def test_grant_list_matches_the_grant_permission(
    api_client_factory,
    db_session_for_api: AsyncSession,
) -> None:
    from app.db.enums import ArchiveVisibility

    editor = await make_user(db_session_for_api, roles=(RoleCode.EDITOR,))
    researcher = await make_user(db_session_for_api, roles=(RoleCode.RESEARCHER,))
    investigation = await make_investigation(db_session_for_api, owner=researcher)
    document = await make_document(
        db_session_for_api,
        investigation=investigation,
        visibility=ArchiveVisibility.RESTRICTED,
        grant_to=[editor],
    )
    url = f"/api/v1/archive/documents/{document.id}/grants"

    async with api_client_factory() as editor_client:
        await login(editor_client, email=editor.email, password=PASSWORD)
        response = await editor_client.get(url)
        assert response.status_code == 200, response.text
        assert [row["user_id"] for row in response.json()["items"]] == [str(editor.id)]

    async with api_client_factory() as researcher_client:
        await login(researcher_client, email=researcher.email, password=PASSWORD)
        assert (await researcher_client.get(url)).status_code == 404

    async with api_client_factory() as anonymous:
        assert (await anonymous.get(url)).status_code == 401
