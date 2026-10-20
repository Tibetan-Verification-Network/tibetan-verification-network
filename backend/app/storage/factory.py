"""Build configured storage backends from application settings."""

from __future__ import annotations

from app.core.config import Settings
from app.storage.base import ObjectStorage
from app.storage.memory import InMemoryStorage
from app.storage.s3 import S3CompatibleStorage


def build_object_storage(settings: Settings) -> ObjectStorage:
    """Return S3-compatible storage when configured, otherwise in-memory storage."""
    endpoint = settings.storage_endpoint_url
    if not endpoint:
        return InMemoryStorage()
    return S3CompatibleStorage(
        endpoint_url=endpoint,
        bucket=settings.storage_bucket,
        access_key_id=settings.storage_access_key_id.get_secret_value(),
        secret_access_key=settings.storage_secret_access_key.get_secret_value(),
        region=settings.storage_region,
    )
