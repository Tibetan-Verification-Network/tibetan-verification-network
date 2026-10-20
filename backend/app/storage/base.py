"""Object storage protocol for archive files."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Protocol


class ObjectStorage(Protocol):
    """Store and retrieve private archive blobs."""

    def put_stream(
        self,
        key: str,
        chunks: Iterator[bytes],
        *,
        content_type: str,
        content_length: int | None = None,
    ) -> None:
        """Upload ``key`` from an iterator of byte chunks."""
        ...

    def delete(self, key: str) -> None:
        """Remove ``key`` if it exists."""
        ...

    def presign_get(self, key: str, *, ttl_seconds: int, filename: str) -> str:
        """Return a time-limited GET URL for ``key``."""
        ...

    def head(self, key: str) -> dict[str, str | int] | None:
        """Return object metadata or ``None`` when missing."""
        ...
