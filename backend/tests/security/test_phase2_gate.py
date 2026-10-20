"""Phase 2 security gate: roles, public isolation, and archive access."""

from __future__ import annotations

import io
import json

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import ArchiveVisibility, RoleCode
from tests.auth_helpers import csrf_headers, login
from tests.factories import make_document, make_investigation, make_user

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xdb"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)

EDITORIAL_GET_ROUTES = [
    "/api/v1/editorial/submissions",
    "/api/v1/editorial/claims",
    "/api/v1/investigations",
    "/api/v1/archive/documents",
]


@pytest.mark.usefixtures("db_session_for_api")
async def test_anonymous_requests_rejected_on_editorial_routes(api_client: AsyncClient) -> None:
    for path in EDITORIAL_GET_ROUTES:
        response = await api_client.get(path)
        assert response.status_code in {401, 403, 404}, path


@pytest.mark.usefixtures("db_session_for_api")
async def test_public_submission_response_has_no_editorial_fields(api_client: AsyncClient) -> None:
    response = await api_client.post(
        "/api/v1/submissions",
        json={
            "claim_text": "Public claim text long enough",
            "privacy_consent": True,
            "website": "",
        },
    )
    assert response.status_code == 202
    body = response.json()
    assert "contact" not in body
    assert "storage_key" not in json.dumps(body)


@pytest.mark.usefixtures("db_session_for_api")
async def test_platform_admin_cannot_read_restricted_archive(
    api_client_factory,
    db_session_for_api: AsyncSession,
) -> None:
    editor = await make_user(db_session_for_api, email="ed@example.org", roles=(RoleCode.EDITOR,))
    admin = await make_user(
        db_session_for_api,
        email="admin@example.org",
        roles=(RoleCode.PLATFORM_ADMINISTRATOR,),
    )
    investigation = await make_investigation(db_session_for_api, owner=editor)
    document = await make_document(
        db_session_for_api,
        investigation=investigation,
        visibility=ArchiveVisibility.RESTRICTED,
        grant_to=(editor,),
    )
    async with api_client_factory() as client:
        session = await login(client, email=admin.email, password="correct-horse-battery-staple")
        response = await client.get(
            f"/api/v1/archive/documents/{document.id}",
            headers=csrf_headers(session["csrf_token"]),
        )
        assert response.status_code == 404


@pytest.mark.usefixtures("db_session_for_api")
async def test_foreign_investigation_document_upload_returns_404(
    as_user,
    db_session_for_api: AsyncSession,
) -> None:
    owner = await make_user(
        db_session_for_api,
        email="inv-owner@example.org",
        roles=(RoleCode.RESEARCHER,),
    )
    foreign = await make_investigation(db_session_for_api, owner=owner)
    async with as_user(roles=(RoleCode.RESEARCHER,)) as (client, _user, session):
        files = {"file": ("x.png", io.BytesIO(PNG_BYTES), "image/png")}
        response = await client.post(
            f"/api/v1/investigations/{foreign.id}/documents",
            data={"title": "Secret"},
            files=files,
            headers=csrf_headers(session["csrf_token"]),
        )
        assert response.status_code == 404


@pytest.mark.usefixtures("db_session_for_api")
async def test_openapi_archive_schemas_exclude_storage_key(api_client: AsyncClient) -> None:
    response = await api_client.get("/openapi.json")
    assert response.status_code == 200
    schema_blob = json.dumps(response.json())
    assert "storage_key" not in schema_blob
