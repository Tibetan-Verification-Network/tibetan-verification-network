"""Stage 1C staff identity, sessions, CSRF, and authorization tests."""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_opaque_token, hash_opaque_token, hash_password
from app.db.enums import RoleCode
from app.models.audit import AuditEvent
from app.models.identity import StaffInvite, User
from app.services.bootstrap import bootstrap_platform_admin
from app.services.invites import create_staff_invite
from tests.auth_helpers import csrf_headers, login
from tests.helpers import production_settings, settings_for_tests

STRONG_PASSWORD = "correct-horse-battery-staple"


async def _bootstrap_admin(
    db_session_for_api: AsyncSession,
    email: str = "admin@example.org",
) -> User:
    result = await bootstrap_platform_admin(
        db_session_for_api,
        email=email,
        password=STRONG_PASSWORD,
        display_name="Admin",
    )
    return result.user


async def test_bootstrap_is_idempotent(db_session_for_api: AsyncSession) -> None:
    await _bootstrap_admin(db_session_for_api)
    with pytest.raises(RuntimeError, match="already exists"):
        await bootstrap_platform_admin(
            db_session_for_api,
            email="other-admin@example.org",
            password=STRONG_PASSWORD,
        )


async def test_no_public_register_route(api_client: AsyncClient) -> None:
    response = await api_client.get("/openapi.json")
    paths = response.json()["paths"]
    assert not any("register" in path for path in paths)


async def test_invite_activate_login_me_and_editorial(
    api_client: AsyncClient,
    db_session_for_api: AsyncSession,
) -> None:
    admin = await _bootstrap_admin(db_session_for_api)
    created = await create_staff_invite(
        db_session_for_api,
        email="Researcher@Example.org",
        role_codes=[RoleCode.RESEARCHER],
        invited_by_id=admin.id,
        settings=settings_for_tests(),
    )
    activate = await api_client.post(
        "/api/v1/auth/activate",
        json={"token": created.raw_token, "password": STRONG_PASSWORD},
    )
    assert activate.status_code == 201
    assert activate.json()["roles"] == [RoleCode.RESEARCHER.value]

    session = await login(api_client, email="researcher@example.org", password=STRONG_PASSWORD)
    me = await api_client.get("/api/v1/me")
    assert me.status_code == 200
    assert me.json()["email"] == "Researcher@Example.org"

    protected = await api_client.get("/api/v1/editorial/status")
    assert protected.status_code == 200
    assert protected.json()["status"] == "ok"

    logout = await api_client.post(
        "/api/v1/auth/logout",
        headers=csrf_headers(session["csrf_token"]),
    )
    assert logout.status_code == 204

    rejected = await api_client.get("/api/v1/me")
    assert rejected.status_code == 401


async def test_anonymous_editorial_route_is_rejected(api_client: AsyncClient) -> None:
    response = await api_client.get("/api/v1/editorial/status")
    assert response.status_code == 401


async def test_login_failure_is_generic(
    api_client: AsyncClient,
    db_session_for_api: AsyncSession,
) -> None:
    await _bootstrap_admin(db_session_for_api)
    response = await api_client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.org", "password": "wrong-password-value"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."


async def test_logout_requires_csrf(
    api_client: AsyncClient,
    db_session_for_api: AsyncSession,
) -> None:
    await _bootstrap_admin(db_session_for_api)
    await login(api_client, email="admin@example.org", password=STRONG_PASSWORD)
    response = await api_client.post("/api/v1/auth/logout")
    assert response.status_code == 403


async def test_invite_reuse_and_expiry_are_rejected(
    api_client: AsyncClient,
    db_session_for_api: AsyncSession,
) -> None:
    admin = await _bootstrap_admin(db_session_for_api)
    created = await create_staff_invite(
        db_session_for_api,
        email="staff@example.org",
        role_codes=[RoleCode.EDITOR],
        invited_by_id=admin.id,
        settings=settings_for_tests(),
    )
    first = await api_client.post(
        "/api/v1/auth/activate",
        json={"token": created.raw_token, "password": STRONG_PASSWORD},
    )
    assert first.status_code == 201
    second = await api_client.post(
        "/api/v1/auth/activate",
        json={"token": created.raw_token, "password": STRONG_PASSWORD},
    )
    assert second.status_code == 400

    expired_token = generate_opaque_token()
    expired_invite = StaffInvite(
        email="expired@example.org",
        email_normalized="expired@example.org",
        token_hash=hash_opaque_token(expired_token),
        expires_at=datetime.now(tz=UTC) - timedelta(hours=1),
        invited_by_id=admin.id,
    )
    db_session_for_api.add(expired_invite)
    await db_session_for_api.flush()
    expired_response = await api_client.post(
        "/api/v1/auth/activate",
        json={"token": expired_token, "password": STRONG_PASSWORD},
    )
    assert expired_response.status_code == 400


async def test_admin_invite_and_disable_revokes_sessions(
    api_client: AsyncClient,
    api_client_factory,
    db_session_for_api: AsyncSession,
) -> None:
    await _bootstrap_admin(db_session_for_api)
    admin_session = await login(api_client, email="admin@example.org", password=STRONG_PASSWORD)

    invite_response = await api_client.post(
        "/api/v1/admin/invites",
        headers=csrf_headers(admin_session["csrf_token"]),
        json={"email": "editor@example.org", "role_codes": [RoleCode.EDITOR.value]},
    )
    assert invite_response.status_code == 201
    token = invite_response.json()["token"]

    async with api_client_factory() as editor_client:
        await editor_client.post(
            "/api/v1/auth/activate",
            json={"token": token, "password": STRONG_PASSWORD},
        )
        await login(editor_client, email="editor@example.org", password=STRONG_PASSWORD)
        assert (await editor_client.get("/api/v1/me")).status_code == 200

        editor_id = await db_session_for_api.scalar(
            select(User.id).where(User.email_normalized == "editor@example.org")
        )
        disable = await api_client.post(
            f"/api/v1/admin/users/{editor_id}/disable",
            headers=csrf_headers(admin_session["csrf_token"]),
        )
        assert disable.status_code == 200
        assert (await editor_client.get("/api/v1/me")).status_code == 401


async def test_role_check_blocks_admin_only_route(
    api_client: AsyncClient,
    db_session_for_api: AsyncSession,
) -> None:
    admin = await _bootstrap_admin(db_session_for_api)
    created = await create_staff_invite(
        db_session_for_api,
        email="researcher2@example.org",
        role_codes=[RoleCode.RESEARCHER],
        invited_by_id=admin.id,
        settings=settings_for_tests(),
    )
    await api_client.post(
        "/api/v1/auth/activate",
        json={"token": created.raw_token, "password": STRONG_PASSWORD},
    )
    session = await login(api_client, email="researcher2@example.org", password=STRONG_PASSWORD)
    response = await api_client.post(
        "/api/v1/admin/invites",
        headers=csrf_headers(session["csrf_token"]),
        json={"email": "blocked@example.org", "role_codes": [RoleCode.RESEARCHER.value]},
    )
    assert response.status_code == 403


async def test_audit_payloads_redact_secrets(db_session_for_api: AsyncSession) -> None:
    await _bootstrap_admin(db_session_for_api)
    events = (
        (await db_session_for_api.execute(select(AuditEvent).order_by(AuditEvent.created_at)))
        .scalars()
        .all()
    )
    assert events
    rendered = str([event.payload for event in events]).lower()
    assert STRONG_PASSWORD not in rendered
    assert "bearer" not in rendered


async def test_production_login_cookie_is_secure() -> None:
    from fastapi import Response

    from app.core.cookies import set_session_cookie

    response = Response()
    set_session_cookie(
        response,
        settings=production_settings(),
        raw_session_token="session-token-value",
        expires_at=datetime.now(tz=UTC) + timedelta(hours=1),
    )
    header = response.headers.get("set-cookie", "")
    assert "Secure" in header
    assert "HttpOnly" in header


async def test_disabled_account_cannot_login(
    api_client: AsyncClient,
    db_session_for_api: AsyncSession,
) -> None:
    user = User(
        email="disabled@example.org",
        email_normalized="disabled@example.org",
        password_hash=hash_password(STRONG_PASSWORD),
        is_active=False,
        disabled_at=datetime.now(tz=UTC),
    )
    db_session_for_api.add(user)
    await db_session_for_api.flush()
    response = await api_client.post(
        "/api/v1/auth/login",
        json={"email": "disabled@example.org", "password": STRONG_PASSWORD},
    )
    assert response.status_code == 401


async def test_csrf_refresh_endpoint(
    api_client: AsyncClient,
    db_session_for_api: AsyncSession,
) -> None:
    await _bootstrap_admin(db_session_for_api)
    await login(api_client, email="admin@example.org", password=STRONG_PASSWORD)
    refreshed = await api_client.get("/api/v1/auth/csrf")
    assert refreshed.status_code == 200
    assert refreshed.json()["csrf_token"]
