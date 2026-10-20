"""Archive upload, grants, classification, and access link tests."""

from __future__ import annotations

import io
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.enums import (
    ArchiveUploadStatus,
    ArchiveVisibility,
    InvestigationAssignmentRole,
    RoleCode,
)
from app.storage.memory import InMemoryStorage
from tests.auth_helpers import csrf_headers
from tests.factories import make_document, make_investigation, make_user
from tests.helpers import settings_for_tests

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xdb"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.mark.usefixtures("db_session_for_api")
async def test_upload_stores_internal_document_without_storage_key_in_response(
    as_user,
    api_application,
    db_session_for_api: AsyncSession,
) -> None:
    storage: InMemoryStorage = api_application.state.object_storage
    async with as_user(roles=(RoleCode.RESEARCHER,)) as (client, owner, session):
        investigation = await make_investigation(db_session_for_api, owner=owner)
        files = {"file": ("evidence.png", io.BytesIO(PNG_BYTES), "application/octet-stream")}
        data = {"title": "Screenshot", "description": "Captured page"}
        response = await client.post(
            f"/api/v1/investigations/{investigation.id}/documents",
            data=data,
            files=files,
            headers=csrf_headers(session["csrf_token"]),
        )
        assert response.status_code == 201, response.text
        payload = response.json()
        assert payload["visibility"] == ArchiveVisibility.INTERNAL.value
        assert payload["upload_status"] == ArchiveUploadStatus.AVAILABLE.value
        assert payload["mime_type"] == "image/png"
        assert "storage_key" not in payload
        assert len(storage._objects) == 1


@pytest.mark.usefixtures("db_session_for_api")
async def test_forged_mime_type_is_rejected(
    as_user,
    db_session_for_api: AsyncSession,
) -> None:
    async with as_user(roles=(RoleCode.RESEARCHER,)) as (client, owner, session):
        investigation = await make_investigation(db_session_for_api, owner=owner)
        files = {"file": ("fake.pdf", io.BytesIO(b"\x00invalid-binary"), "application/pdf")}
        response = await client.post(
            f"/api/v1/investigations/{investigation.id}/documents",
            data={"title": "Not a PDF"},
            files=files,
            headers=csrf_headers(session["csrf_token"]),
        )
        assert response.status_code == 422


@pytest.mark.usefixtures("db_session_for_api")
async def test_oversized_upload_is_rejected(
    as_user,
    api_application,
    db_session_for_api: AsyncSession,
) -> None:
    api_application.state.settings = settings_for_tests(archive_max_upload_bytes=1024)
    async with as_user(roles=(RoleCode.RESEARCHER,)) as (client, owner, session):
        investigation = await make_investigation(db_session_for_api, owner=owner)
        files = {"file": ("big.txt", io.BytesIO(b"x" * 2000), "text/plain")}
        response = await client.post(
            f"/api/v1/investigations/{investigation.id}/documents",
            data={"title": "Too large"},
            files=files,
            headers=csrf_headers(session["csrf_token"]),
        )
        assert response.status_code == 413


@pytest.mark.usefixtures("db_session_for_api")
async def test_restricted_document_requires_grant_for_metadata(
    api_client_factory,
    db_session_for_api: AsyncSession,
) -> None:
    from tests.auth_helpers import login

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
    investigation = await make_investigation(
        db_session_for_api,
        owner=editor,
        assigned=[(researcher, InvestigationAssignmentRole.CONTRIBUTOR)],
    )
    document = await make_document(
        db_session_for_api,
        investigation=investigation,
        visibility=ArchiveVisibility.RESTRICTED,
        grant_to=(editor,),
    )
    async with api_client_factory() as client:
        await login(client, email=researcher.email, password="correct-horse-battery-staple")
        response = await client.get(f"/api/v1/archive/documents/{document.id}")
        assert response.status_code == 404


@pytest.mark.usefixtures("db_session_for_api")
async def test_access_link_expires_with_mocked_clock(
    api_client_factory,
    api_application,
    db_session_for_api: AsyncSession,
) -> None:
    from tests.auth_helpers import login

    clock = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)

    def _now() -> datetime:
        return clock

    api_application.state.object_storage = InMemoryStorage(now=_now)
    editor = await make_user(
        db_session_for_api,
        email="editor2@example.org",
        roles=(RoleCode.EDITOR,),
    )
    investigation = await make_investigation(db_session_for_api, owner=editor)
    document = await make_document(db_session_for_api, investigation=investigation)
    document.storage_key = "archive/test-key"
    document.mime_type = "image/png"
    document.byte_size = len(PNG_BYTES)
    api_application.state.object_storage.put_stream(
        document.storage_key,
        iter([PNG_BYTES]),
        content_type="image/png",
        content_length=len(PNG_BYTES),
    )
    await db_session_for_api.flush()

    async with api_client_factory() as client:
        session = await login(client, email=editor.email, password="correct-horse-battery-staple")
        response = await client.post(
            f"/api/v1/archive/documents/{document.id}/access-link",
            headers=csrf_headers(session["csrf_token"]),
        )
        assert response.status_code == 200, response.text
        url = response.json()["url"]
        storage: InMemoryStorage = api_application.state.object_storage
        assert storage.validate_presigned_url(url) is True
        clock += timedelta(minutes=5)
        assert storage.validate_presigned_url(url) is False
