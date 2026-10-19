"""Current authenticated staff profile."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.routes.auth import serialize_user
from app.core.permissions import get_current_user
from app.schemas.auth import CurrentUserResponse
from app.services.auth import AuthenticatedUser

router = APIRouter(tags=["auth"])


@router.get("/me", response_model=CurrentUserResponse)
async def current_user(
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> CurrentUserResponse:
    return serialize_user(auth)
