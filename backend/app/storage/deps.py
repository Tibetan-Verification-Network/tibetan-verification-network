"""FastAPI dependency for object storage."""

from __future__ import annotations

from typing import cast

from fastapi import Request

from app.storage.base import ObjectStorage
from app.storage.factory import build_object_storage


def get_object_storage(request: Request) -> ObjectStorage:
    storage = getattr(request.app.state, "object_storage", None)
    if storage is not None:
        return cast(ObjectStorage, storage)
    settings = request.app.state.settings
    cached = getattr(request.app.state, "_object_storage_backend", None)
    if cached is None:
        cached = build_object_storage(settings)
        request.app.state._object_storage_backend = cached
    return cast(ObjectStorage, cached)
