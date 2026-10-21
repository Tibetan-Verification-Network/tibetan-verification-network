"""Public claim submission intake."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.deps import get_db_session
from app.schemas.intake import PublicSubmissionRequest, SubmissionReceiptResponse
from app.services.captcha import captcha_verifier_for
from app.services.intake import accept_public_submission

router = APIRouter(prefix="/submissions", tags=["submissions"])


def _settings(request: Request) -> Settings:
    settings = request.app.state.settings
    if not isinstance(settings, Settings):
        raise RuntimeError("application settings are not configured")
    return settings


def _client_ip(request: Request, settings: Settings) -> str:
    if settings.trust_forwarded_for:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    if request.client is not None and request.client.host:
        return request.client.host
    return "unknown"


@router.post(
    "",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=SubmissionReceiptResponse,
)
async def create_submission(
    request: Request,
    payload: PublicSubmissionRequest,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> SubmissionReceiptResponse:
    settings = _settings(request)
    receipt_id = await accept_public_submission(
        db,
        payload=payload,
        settings=settings,
        client_ip=_client_ip(request, settings),
        captcha=captcha_verifier_for(settings),
    )
    return SubmissionReceiptResponse(receipt_id=receipt_id)
