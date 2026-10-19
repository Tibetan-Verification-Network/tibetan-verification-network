"""Minimal authenticated editorial surface for Phase 1 protection checks."""

from fastapi import APIRouter

from app.core.permissions import RequireStaff
from app.schemas.auth import EditorialStatusResponse

router = APIRouter(prefix="/editorial", tags=["editorial"])


@router.get("/status", response_model=EditorialStatusResponse)
async def editorial_status(
    auth: RequireStaff,
) -> EditorialStatusResponse:
    roles = sorted({assignment.role.code for assignment in auth.user.roles})
    return EditorialStatusResponse(status="ok", roles=roles)
