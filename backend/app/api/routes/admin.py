"""Platform administrator operations."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.deps import get_db_session
from app.core.permissions import RequirePlatformAdmin, require_csrf_for_cookie_mutations
from app.schemas.auth import (
    CreateInviteRequest,
    CreateInviteResponse,
    UpdateUserRolesRequest,
    UserSummaryResponse,
)
from app.services.invites import create_staff_invite
from app.services.users import disable_user, get_user_with_roles, replace_user_roles

router = APIRouter(prefix="/admin", tags=["administration"])


def _settings(request: Request) -> Settings:
    settings = request.app.state.settings
    if not isinstance(settings, Settings):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE)
    return settings


def _serialize_user_summary(user: object) -> UserSummaryResponse:
    from app.models.identity import User

    if not isinstance(user, User):
        raise TypeError("expected User")
    roles = sorted({assignment.role.code for assignment in user.roles})
    return UserSummaryResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        roles=roles,
        is_active=user.is_active,
        disabled_at=user.disabled_at,
    )


@router.post("/invites", response_model=CreateInviteResponse, status_code=status.HTTP_201_CREATED)
async def create_invite(
    request: Request,
    body: CreateInviteRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: RequirePlatformAdmin,
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> CreateInviteResponse:
    settings = _settings(request)
    try:
        created = await create_staff_invite(
            db,
            email=body.email,
            role_codes=body.role_codes,
            invited_by_id=auth.user.id,
            settings=settings,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return CreateInviteResponse(
        invite_id=created.invite.id,
        email=created.invite.email,
        expires_at=created.invite.expires_at,
        token=created.raw_token,
    )


@router.post("/users/{user_id}/disable", response_model=UserSummaryResponse)
async def disable_staff_user(
    user_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: RequirePlatformAdmin,
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> UserSummaryResponse:
    if user_id == auth.user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot disable your own account",
        )
    user = await disable_user(db, user_id=user_id, actor_user_id=auth.user.id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    refreshed = await get_user_with_roles(db, user.id)
    assert refreshed is not None
    return _serialize_user_summary(refreshed)


@router.put("/users/{user_id}/roles", response_model=UserSummaryResponse)
async def update_user_roles(
    user_id: UUID,
    body: UpdateUserRolesRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    auth: RequirePlatformAdmin,
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> UserSummaryResponse:
    user = await replace_user_roles(
        db,
        user_id=user_id,
        role_codes=body.role_codes,
        actor_user_id=auth.user.id,
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    refreshed = await get_user_with_roles(db, user.id)
    assert refreshed is not None
    return _serialize_user_summary(refreshed)
