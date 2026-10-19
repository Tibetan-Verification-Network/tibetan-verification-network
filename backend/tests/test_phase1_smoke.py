"""Phase 1 gate: empty database, migrate, bootstrap, invite, session, revoke."""

from __future__ import annotations

import asyncio
import os
from unittest.mock import patch
from urllib.parse import urlsplit, urlunsplit

import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings
from app.db.enums import RoleCode
from app.db.url import to_async_sqlalchemy_url
from tests.auth_helpers import csrf_headers
from tests.db_helpers import postgres_is_available, recreate_database, upgrade_head
from tests.helpers import settings_for_tests

ADMIN_EMAIL = "admin@example.org"
STAFF_EMAIL = "editor@example.org"
PASSWORD = "correct-horse-battery-staple"
SMOKE_DATABASE = "tvn_phase1_smoke"


def smoke_database_url() -> str:
    parsed = urlsplit(
        os.environ.get("DATABASE_URL", "postgresql://tvn:tvn_local_dev@127.0.0.1:5432/tvn")
    )
    scheme = parsed.scheme or "postgresql"
    if scheme.startswith("postgresql+"):
        scheme = "postgresql"
    return urlunsplit((scheme, parsed.netloc, f"/{SMOKE_DATABASE}", "", ""))


async def public_table_names(database_url: str) -> set[str]:
    engine = create_async_engine(to_async_sqlalchemy_url(database_url), pool_pre_ping=True)
    try:
        async with engine.connect() as connection:
            result = await connection.execute(
                text(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    """
                )
            )
            return {row[0] for row in result}
    finally:
        await engine.dispose()


def session_cookie(response: Response) -> str:
    header = response.headers.get("set-cookie")
    assert header is not None
    pair = header.split(";", 1)[0]
    name, value = pair.split("=", 1)
    assert name == "tvn_session"
    assert value
    assert "httponly" in header.lower()
    return value


def bootstrap_admin() -> int:
    from app.cli.bootstrap import main

    get_settings.cache_clear()
    with patch("app.cli.bootstrap.getpass.getpass", return_value=PASSWORD):
        try:
            main(
                [
                    "--email",
                    ADMIN_EMAIL,
                    "--display-name",
                    "Admin",
                    "--password",
                    PASSWORD,
                ]
            )
        except SystemExit as exc:
            if exc.code is None:
                return 0
            if isinstance(exc.code, int):
                return exc.code
            return 1
    return 0


async def test_phase1_smoke_from_empty_database() -> None:
    database_url = smoke_database_url()
    if not await postgres_is_available(database_url):
        pytest.skip("PostgreSQL is not available for the Phase 1 smoke test")

    previous_database_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = database_url
    os.environ["TVN_ENV_FILE"] = ""
    os.environ["ENVIRONMENT"] = "test"
    os.environ["CORS_ORIGINS"] = "http://localhost:5173"
    get_settings.cache_clear()
    try:
        await recreate_database(database_url)
        assert await public_table_names(database_url) == set()
        upgrade_head(database_url)
        get_settings.cache_clear()
        assert await asyncio.to_thread(bootstrap_admin) == 0

        from app.main import create_app

        application = create_app(settings_for_tests(database_url=database_url))
        transport = ASGITransport(app=application)
        async with application.router.lifespan_context(application):
            async with AsyncClient(transport=transport, base_url="http://testserver") as admin:
                register = await admin.post("/api/v1/auth/register", json={})
                assert register.status_code == 404
                openapi = await admin.get("/openapi.json")
                assert all("register" not in path for path in openapi.json()["paths"])

                admin_login = await admin.post(
                    "/api/v1/auth/login",
                    json={"email": ADMIN_EMAIL, "password": PASSWORD},
                )
                assert admin_login.status_code == 200
                invite = await admin.post(
                    "/api/v1/admin/invites",
                    headers=csrf_headers(admin_login.json()["csrf_token"]),
                    json={"email": STAFF_EMAIL, "role_codes": [RoleCode.EDITOR.value]},
                )
                assert invite.status_code == 201
                token = invite.json()["token"]

            async with AsyncClient(transport=transport, base_url="http://testserver") as staff:
                activated = await staff.post(
                    "/api/v1/auth/activate",
                    json={"token": token, "password": PASSWORD, "display_name": "Editor"},
                )
                assert activated.status_code == 201
                assert activated.json()["email"] == STAFF_EMAIL

                staff_login = await staff.post(
                    "/api/v1/auth/login",
                    json={"email": STAFF_EMAIL, "password": PASSWORD},
                )
                assert staff_login.status_code == 200
                raw_session = session_cookie(staff_login)
                assert (await staff.get("/api/v1/me")).status_code == 200
                protected = await staff.get("/api/v1/editorial/status")
                assert protected.status_code == 200
                assert protected.json()["status"] == "ok"

                logout = await staff.post(
                    "/api/v1/auth/logout",
                    headers=csrf_headers(staff_login.json()["csrf_token"]),
                )
                assert logout.status_code == 204

            async with AsyncClient(transport=transport, base_url="http://testserver") as reused:
                reused.cookies.set("tvn_session", raw_session, domain="testserver", path="/")
                assert reused.cookies.get("tvn_session") == raw_session
                assert (await reused.get("/api/v1/me")).status_code == 401
                assert (await reused.get("/api/v1/editorial/status")).status_code == 401
    finally:
        if previous_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous_database_url
        get_settings.cache_clear()
