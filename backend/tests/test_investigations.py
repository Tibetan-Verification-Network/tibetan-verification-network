"""Investigation workspace access, pagination, and evidence provenance tests."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import (
    EvidenceStance,
    InvestigationAssignmentRole,
    RoleCode,
    WorkflowStatus,
)
from app.models.research import Source
from tests.auth_helpers import csrf_headers, login
from tests.factories import make_claim, make_investigation, make_user

STRONG_PASSWORD = "correct-horse-battery-staple"


async def _create_via_api(
    client: AsyncClient,
    session: dict,
    *,
    claim_id: uuid.UUID | None = None,
    submission_id: uuid.UUID | None = None,
) -> dict:
    payload = {"claim_id": str(claim_id)} if claim_id else {"submission_id": str(submission_id)}
    response = await client.post(
        "/api/v1/investigations",
        json=payload,
        headers=csrf_headers(session["csrf_token"]),
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.usefixtures("db_session_for_api")
async def test_researcher_cannot_access_foreign_investigation(
    as_user,
    db_session_for_api: AsyncSession,
) -> None:
    owner = await make_user(
        db_session_for_api,
        email="owner@example.org",
        roles=(RoleCode.RESEARCHER,),
    )
    foreign = await make_investigation(db_session_for_api, owner=owner)
    async with as_user(roles=(RoleCode.RESEARCHER,)) as (client, _user, _session):
        response = await client.get(f"/api/v1/investigations/{foreign.id}")
        assert response.status_code == 404


@pytest.mark.usefixtures("db_session_for_api")
async def test_cross_investigation_source_reference_returns_422(
    as_user,
    db_session_for_api: AsyncSession,
) -> None:
    owner = await make_user(
        db_session_for_api,
        email="owner-a@example.org",
        roles=(RoleCode.RESEARCHER,),
    )
    inv_a = await make_investigation(db_session_for_api, owner=owner)
    inv_b = await make_investigation(db_session_for_api, owner=owner)
    foreign_source = Source(
        investigation_id=inv_b.id,
        title="Foreign source",
        created_by_id=owner.id,
    )
    db_session_for_api.add(foreign_source)
    await db_session_for_api.flush()

    async with as_user(roles=(RoleCode.EDITOR,)) as (client, _user, session):
        body = await _create_via_api(client, session, claim_id=inv_a.claim_id)
        investigation_id = body["investigation"]["id"]
        response = await client.post(
            f"/api/v1/investigations/{investigation_id}/evidence",
            json={"source_id": str(foreign_source.id), "stance": "supports"},
            headers=csrf_headers(session["csrf_token"]),
        )
        assert response.status_code == 422


@pytest.mark.usefixtures("db_session_for_api")
async def test_list_pagination_applies_scope_before_limit(
    as_user,
    db_session_for_api: AsyncSession,
) -> None:
    editor = await make_user(
        db_session_for_api,
        email="editor@example.org",
        roles=(RoleCode.EDITOR,),
    )
    researcher = await make_user(
        db_session_for_api,
        email="researcher@example.org",
        roles=(RoleCode.RESEARCHER,),
    )
    for _ in range(5):
        await make_investigation(db_session_for_api, owner=editor)
    visible = await make_investigation(
        db_session_for_api,
        owner=editor,
        assigned=[(researcher, InvestigationAssignmentRole.CONTRIBUTOR)],
    )

    async with as_user(roles=(RoleCode.RESEARCHER,)) as (client, _user, _session):
        client.cookies.clear()
        session = await login(
            client,
            email=researcher.email,
            password=STRONG_PASSWORD,
        )
        _ = session
        response = await client.get("/api/v1/investigations?limit=10")
        assert response.status_code == 200
        body = response.json()
        assert len(body["items"]) == 1
        assert body["items"][0]["id"] == str(visible.id)


@pytest.mark.usefixtures("db_session_for_api")
async def test_assignment_removal_revokes_access(
    as_user,
    db_session_for_api: AsyncSession,
) -> None:
    editor = await make_user(
        db_session_for_api,
        email="editor@example.org",
        roles=(RoleCode.EDITOR,),
    )
    researcher = await make_user(
        db_session_for_api,
        email="contrib@example.org",
        roles=(RoleCode.RESEARCHER,),
    )
    investigation = await make_investigation(
        db_session_for_api,
        owner=editor,
        assigned=[(researcher, InvestigationAssignmentRole.CONTRIBUTOR)],
    )

    async with as_user(roles=(RoleCode.EDITOR,)) as (client, _user, _session):
        client.cookies.clear()
        editor_session = await login(
            client,
            email=editor.email,
            password=STRONG_PASSWORD,
        )
        response = await client.delete(
            f"/api/v1/investigations/{investigation.id}/assignments/{researcher.id}",
            headers=csrf_headers(editor_session["csrf_token"]),
        )
        assert response.status_code == 200

    async with as_user(roles=(RoleCode.RESEARCHER,)) as (client, _user, _session):
        client.cookies.clear()
        await login(client, email=researcher.email, password=STRONG_PASSWORD)
        response = await client.get(f"/api/v1/investigations/{investigation.id}")
        assert response.status_code == 404


@pytest.mark.usefixtures("db_session_for_api")
async def test_approver_has_read_only_workspace_access(
    as_user,
    db_session_for_api: AsyncSession,
) -> None:
    owner = await make_user(
        db_session_for_api,
        email="owner@example.org",
        roles=(RoleCode.RESEARCHER,),
    )
    approver = await make_user(
        db_session_for_api,
        email="approver@example.org",
        roles=(RoleCode.APPROVER,),
    )
    investigation = await make_investigation(
        db_session_for_api,
        owner=owner,
        assigned=[(approver, InvestigationAssignmentRole.CONTRIBUTOR)],
    )

    async with as_user(roles=(RoleCode.APPROVER,)) as (client, _user, _session):
        client.cookies.clear()
        session = await login(client, email=approver.email, password=STRONG_PASSWORD)
        read = await client.get(f"/api/v1/investigations/{investigation.id}")
        assert read.status_code == 200
        patch = await client.patch(
            f"/api/v1/investigations/{investigation.id}",
            json={"internal_notes": "blocked"},
            headers=csrf_headers(session["csrf_token"]),
        )
        assert patch.status_code == 404
        write = await client.post(
            f"/api/v1/investigations/{investigation.id}/sources",
            json={"title": "Blocked source"},
            headers=csrf_headers(session["csrf_token"]),
        )
        assert write.status_code == 404


@pytest.mark.usefixtures("db_session_for_api")
async def test_workspace_crud_and_reorder(
    as_user,
    db_session_for_api: AsyncSession,
) -> None:
    claim = await make_claim(db_session_for_api)
    async with as_user(roles=(RoleCode.RESEARCHER,)) as (client, user, session):
        detail = await _create_via_api(client, session, claim_id=claim.id)
        investigation_id = detail["investigation"]["id"]

        source_a = await client.post(
            f"/api/v1/investigations/{investigation_id}/sources",
            json={"title": "Source A", "url": "https://example.org/a"},
            headers=csrf_headers(session["csrf_token"]),
        )
        source_b = await client.post(
            f"/api/v1/investigations/{investigation_id}/sources",
            json={"title": "Source B"},
            headers=csrf_headers(session["csrf_token"]),
        )
        assert source_a.status_code == 201
        assert source_b.status_code == 201

        evidence = await client.post(
            f"/api/v1/investigations/{investigation_id}/evidence",
            json={
                "source_id": source_a.json()["id"],
                "stance": EvidenceStance.SUPPORTS.value,
                "excerpt": "Supporting excerpt",
            },
            headers=csrf_headers(session["csrf_token"]),
        )
        assert evidence.status_code == 201

        reorder = await client.post(
            f"/api/v1/investigations/{investigation_id}/sources/reorder",
            json={
                "ordered_ids": [
                    source_b.json()["id"],
                    source_a.json()["id"],
                ]
            },
            headers=csrf_headers(session["csrf_token"]),
        )
        assert reorder.status_code == 200
        ordered = reorder.json()["sources"]
        assert ordered[0]["title"] == "Source B"

        hold = await client.post(
            f"/api/v1/investigations/{investigation_id}/status",
            json={"status": WorkflowStatus.ON_HOLD.value, "reason": "Awaiting documents"},
            headers=csrf_headers(session["csrf_token"]),
        )
        assert hold.status_code == 200
        assert hold.json()["investigation"]["workflow_status"] == WorkflowStatus.ON_HOLD.value

        _ = user
