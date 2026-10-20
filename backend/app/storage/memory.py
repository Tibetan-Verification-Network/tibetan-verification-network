"""In-memory object storage for tests and local development without MinIO."""

from __future__ import annotations

import hashlib
import hmac
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse

from app.storage.base import ObjectStorage


@dataclass
class _StoredObject:
    body: bytes
    content_type: str


class InMemoryStorage(ObjectStorage):
    """Process-local blob store with presigned URL semantics."""

    def __init__(
        self,
        *,
        signing_secret: str = "test-storage-signing-secret",
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._objects: dict[str, _StoredObject] = {}
        self._signing_secret = signing_secret.encode()
        self._now = now or (lambda: datetime.now(UTC))

    def put_stream(
        self,
        key: str,
        chunks: Iterator[bytes],
        *,
        content_type: str,
        content_length: int | None = None,
    ) -> None:
        body = b"".join(chunks)
        if content_length is not None and len(body) != content_length:
            msg = "Uploaded size does not match declared content length"
            raise ValueError(msg)
        self._objects[key] = _StoredObject(body=body, content_type=content_type)

    def delete(self, key: str) -> None:
        self._objects.pop(key, None)

    def presign_get(self, key: str, *, ttl_seconds: int, filename: str) -> str:
        if key not in self._objects:
            msg = f"Object not found: {key}"
            raise KeyError(msg)
        expires_at = self._now() + timedelta(seconds=ttl_seconds)
        expires_epoch = int(expires_at.timestamp())
        token = hmac.new(
            self._signing_secret,
            f"{key}:{expires_epoch}:{filename}".encode(),
            hashlib.sha256,
        ).hexdigest()
        query = urlencode(
            {
                "expires": expires_epoch,
                "filename": filename,
                "token": token,
            }
        )
        return f"memory://{quote(key, safe='')}?{query}"

    def head(self, key: str) -> dict[str, str | int] | None:
        stored = self._objects.get(key)
        if stored is None:
            return None
        return {
            "content_type": stored.content_type,
            "content_length": len(stored.body),
        }

    def validate_presigned_url(self, url: str) -> bool:
        """Return whether ``url`` is a valid, unexpired presigned link."""
        parsed = urlparse(url)
        if parsed.scheme != "memory":
            return False
        key = unquote(parsed.netloc or parsed.path.lstrip("/"))
        params = parse_qs(parsed.query)
        expires = int(params["expires"][0])
        filename = params["filename"][0]
        token = params["token"][0]
        if self._now().timestamp() > expires:
            return False
        expected = hmac.new(
            self._signing_secret,
            f"{key}:{expires}:{filename}".encode(),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, token)

    def read(self, key: str) -> bytes | None:
        stored = self._objects.get(key)
        return None if stored is None else stored.body


def random_storage_key() -> str:
    return f"archive/{uuid.uuid4()}"
