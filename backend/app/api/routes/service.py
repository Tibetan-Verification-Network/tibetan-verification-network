"""Versioned service metadata."""

from fastapi import APIRouter

from app.core.constants import API_VERSION, PRODUCT_NAME
from app.schemas.system import ServiceInfo

router = APIRouter(tags=["service"])


@router.get("", response_model=ServiceInfo)
async def service_info() -> ServiceInfo:
    """Identify the API without exposing configuration."""
    return ServiceInfo(name=PRODUCT_NAME, version=API_VERSION)
