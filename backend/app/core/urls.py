"""Safe URL parsing for stored references (never fetched remotely)."""

from __future__ import annotations

from urllib.parse import urlsplit, urlunsplit

MAX_URL_LENGTH = 2048
_ALLOWED_SCHEMES = frozenset({"http", "https"})


class UnsafeUrlError(ValueError):
    """Raised when a URL must be rejected before persistence."""


def parse_submission_source_url(raw: str) -> str:
    if len(raw) > MAX_URL_LENGTH:
        raise UnsafeUrlError("URL is too long")
    lowered = raw.strip()
    if lowered.lower().startswith(("javascript:", "data:")):
        raise UnsafeUrlError("URL scheme is not allowed")

    parsed = urlsplit(lowered)
    scheme = parsed.scheme.lower()
    if scheme not in _ALLOWED_SCHEMES:
        raise UnsafeUrlError("URL scheme is not allowed")
    if parsed.username or parsed.password:
        raise UnsafeUrlError("URL must not embed credentials")
    if not parsed.netloc:
        raise UnsafeUrlError("URL must include a host")

    host = parsed.hostname or ""
    try:
        ascii_host = host.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise UnsafeUrlError("URL host is not valid") from exc

    port = f":{parsed.port}" if parsed.port is not None else ""
    netloc = f"{ascii_host}{port}"
    normalized = urlunsplit((scheme, netloc, parsed.path or "", parsed.query, ""))
    if len(normalized) > MAX_URL_LENGTH:
        raise UnsafeUrlError("URL is too long")
    return normalized
