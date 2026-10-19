"""Staff authentication routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.cookies import clear_session_cookie, set_session_cookie
from app.core.deps import get_db_session
from app.core.permissions import (
    get_current_user,
    require_csrf_for_cookie_mutations,
)
from app.core.security import GENERIC_AUTH_FAILURE, generate_opaque_token, hash_opaque_token
from app.schemas.auth import (
    ActivateInviteRequest,
    AuthSessionResponse,
    CsrfResponse,
    CurrentUserResponse,
    LoginRequest,
)
from app.services.audit import AuditEventType, record_audit_event
from app.services.auth import AuthenticatedUser, login_with_password, revoke_session
from app.services.invites import activate_staff_invite

router = APIRouter(prefix="/auth", tags=["auth"])


def _settings(request: Request) -> Settings:
    settings = request.app.state.settings
    if not isinstance(settings, Settings):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE)
    return settings


def _validate_password_length(settings: Settings, password: str) -> None:
    if len(password) < settings.password_min_length:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Password must be at least {settings.password_min_length} characters",
        )


def serialize_user(auth: AuthenticatedUser) -> CurrentUserResponse:
    roles = sorted({assignment.role.code for assignment in auth.user.roles})
    return CurrentUserResponse(
        id=auth.user.id,
        email=auth.user.email,
        display_name=auth.user.display_name,
        roles=roles,
        is_active=auth.user.is_active,
    )


@router.get("/csrf", response_model=CsrfResponse)
async def issue_csrf_token(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> CsrfResponse:
    """Issue a fresh CSRF token for the active session."""
    _ = request
    raw_csrf_token = generate_opaque_token()
    auth.session.csrf_token_hash = hash_opaque_token(raw_csrf_token)
    await db.flush()
    return CsrfResponse(csrf_token=raw_csrf_token)


@router.post("/login", response_model=AuthSessionResponse)
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> AuthSessionResponse:
    settings = _settings(request)
    _validate_password_length(settings, body.password)
    bundle, error = await login_with_password(
        db,
        email=body.email,
        password=body.password,
        settings=settings,
    )
    if bundle is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error or GENERIC_AUTH_FAILURE,
        )
    set_session_cookie(
        response,
        settings=settings,
        raw_session_token=bundle.raw_session_token,
        expires_at=bundle.session.expires_at,
    )
    return AuthSessionResponse(csrf_token=bundle.raw_csrf_token)


@router.post("/activate", response_model=CurrentUserResponse, status_code=status.HTTP_201_CREATED)
async def activate_invite(
    request: Request,
    body: ActivateInviteRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> CurrentUserResponse:
    settings = _settings(request)
    _validate_password_length(settings, body.password)
    result, error = await activate_staff_invite(
        db,
        raw_token=body.token,
        password=body.password,
        display_name=body.display_name,
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error or "Invalid or expired invite",
        )
    roles = sorted({assignment.role.code for assignment in result.user.roles})
    return CurrentUserResponse(
        id=result.user.id,
        email=result.user.email,
        display_name=result.user.display_name,
        roles=roles,
        is_active=result.user.is_active,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> Response:
    settings = _settings(request)
    await revoke_session(
        db,
        auth_session=auth.session,
        actor_user_id=auth.user.id,
        reason="logout",
    )
    await record_audit_event(
        db,
        event_type=AuditEventType.LOGOUT,
        actor_user_id=auth.user.id,
        subject_type="auth_session",
        subject_id=auth.session.id,
    )
    clear_session_cookie(response, settings=settings)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
