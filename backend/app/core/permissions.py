"""Authentication and role dependencies."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.deps import get_db_session
from app.core.security import (
    CSRF_HEADER_NAME,
    GENERIC_CSRF_FAILURE,
    GENERIC_FORBIDDEN,
    GENERIC_ORIGIN_FAILURE,
)
from app.db.enums import RoleCode
from app.models.identity import User
from app.services.auth import AuthenticatedUser, authenticate_session, csrf_is_valid

MUTATION_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
CSRF_EXEMPT_SUFFIXES = (
    "/auth/login",
    "/auth/activate",
)


def _settings(request: Request) -> Settings:
    settings = request.app.state.settings
    if not isinstance(settings, Settings):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE)
    return settings


def _session_token(request: Request, settings: Settings) -> str | None:
    return request.cookies.get(settings.session_cookie_name)


async def get_optional_user(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> AuthenticatedUser | None:
    settings = _settings(request)
    return await authenticate_session(db, raw_session_token=_session_token(request, settings))


async def get_current_user(
    auth: Annotated[AuthenticatedUser | None, Depends(get_optional_user)],
) -> AuthenticatedUser:
    if auth is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return auth


def user_has_any_role(user: User, role_codes: set[RoleCode]) -> bool:
    assigned = {assignment.role.code for assignment in user.roles}
    return bool(assigned.intersection(role_codes))


def require_roles(*role_codes: RoleCode) -> Callable[..., Awaitable[AuthenticatedUser]]:
    allowed = set(role_codes)

    async def _dependency(
        auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    ) -> AuthenticatedUser:
        if not user_has_any_role(auth.user, allowed):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=GENERIC_FORBIDDEN)
        return auth

    return _dependency


def _origin_is_allowed(settings: Settings, origin: str | None) -> bool:
    if not origin:
        return settings.environment != "production"
    normalized = origin.rstrip("/")
    for allowed in settings.cors_origins:
        if normalized == allowed.rstrip("/"):
            return True
    parsed = urlsplit(origin)
    if parsed.path not in {"", "/"}:
        return False
    host = parsed.hostname or ""
    if ":" in host:
        host = f"[{host}]"
    port = f":{parsed.port}" if parsed.port is not None else ""
    canonical = f"{parsed.scheme}://{host}{port}"
    return canonical in settings.cors_origins


def _csrf_exempt(path: str) -> bool:
    return any(path.endswith(suffix) for suffix in CSRF_EXEMPT_SUFFIXES)


async def require_csrf_for_cookie_mutations(
    request: Request,
    auth: Annotated[AuthenticatedUser | None, Depends(get_optional_user)],
) -> None:
    if request.method not in MUTATION_METHODS or _csrf_exempt(request.url.path):
        return
    settings = _settings(request)
    if _session_token(request, settings) is None:
        return
    if auth is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    if not _origin_is_allowed(settings, request.headers.get("origin")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=GENERIC_ORIGIN_FAILURE)
    csrf_token = request.headers.get(CSRF_HEADER_NAME)
    if not csrf_is_valid(auth.session, csrf_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=GENERIC_CSRF_FAILURE)


RequirePlatformAdmin = Annotated[
    AuthenticatedUser,
    Depends(require_roles(RoleCode.PLATFORM_ADMINISTRATOR)),
]

RequireStaff = Annotated[
    AuthenticatedUser,
    Depends(
        require_roles(
            RoleCode.PLATFORM_ADMINISTRATOR,
            RoleCode.RESEARCHER,
            RoleCode.EDITOR,
            RoleCode.APPROVER,
        )
    ),
]
