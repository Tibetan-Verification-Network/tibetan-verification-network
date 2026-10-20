"""Archive upload sniffing and filename sanitization."""

from __future__ import annotations

import re
import unicodedata
from pathlib import PurePosixPath

ALLOWED_ARCHIVE_MIME_TYPES = frozenset(
    {
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
        "text/plain",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
)

_FILENAME_UNSAFE = re.compile(r"[^\w.\- ()]+", re.UNICODE)


def sanitize_original_filename(name: str | None) -> str:
    """Return a safe display filename for storage metadata."""
    if not name or not name.strip():
        return "upload.bin"
    base = PurePosixPath(name.replace("\\", "/")).name.strip()
    base = unicodedata.normalize("NFC", base)
    cleaned = _FILENAME_UNSAFE.sub("_", base)
    cleaned = cleaned.strip("._") or "upload.bin"
    return cleaned[:500]


def detect_archive_mime_type(sample: bytes) -> str | None:
    """Detect allowed archive MIME type from the first bytes of a file."""
    if sample.startswith(b"%PDF-"):
        return "application/pdf"
    if sample.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if sample.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(sample) >= 12 and sample[:4] == b"RIFF" and sample[8:12] == b"WEBP":
        return "image/webp"
    if sample.startswith(b"PK\x03\x04") and b"word/" in sample[:8192]:
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if _looks_like_plain_text(sample):
        return "text/plain"
    return None


def _looks_like_plain_text(sample: bytes) -> bool:
    if not sample or b"\x00" in sample:
        return False
    try:
        sample.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True
