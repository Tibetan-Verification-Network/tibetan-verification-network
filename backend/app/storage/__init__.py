"""Private object storage adapters."""

from app.storage.base import ObjectStorage
from app.storage.factory import build_object_storage

__all__ = ["ObjectStorage", "build_object_storage"]
