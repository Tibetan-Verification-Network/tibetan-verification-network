"""Process liveness and database readiness."""

from fastapi import APIRouter, Request, Response, status

from app.core.config import Settings
from app.db.lifecycle import get_engine
from app.db.readiness import database_is_ready
from app.schemas.system import LivenessResponse, ReadinessResponse

router = APIRouter(tags=["operations"])


@router.get("/health", response_model=LivenessResponse)
async def health() -> LivenessResponse:
    """Report that the process can serve requests. This does not touch the database."""
    return LivenessResponse(status="ok")


@router.get("/ready", response_model=ReadinessResponse)
async def ready(request: Request, response: Response) -> ReadinessResponse:
    """Report whether PostgreSQL accepts a connection."""
    settings = request.app.state.settings
    if not isinstance(settings, Settings):
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ReadinessResponse(status="not_ready")
    is_ready = await database_is_ready(
        settings.database_url.get_secret_value(),
        settings.readiness_timeout_seconds,
        engine=get_engine(request.app),
    )
    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ReadinessResponse(status="not_ready")
    return ReadinessResponse(status="ready")
