"""Remove credentials from text before it is written to a log."""

import re

_URL_USERINFO = re.compile(r"(?i)(postgres(?:ql)?(?:\+asyncpg)?://)([^@\s]+)@")
_BEARER = re.compile(r"(?i)\bBearer\s+\S+")
_SENSITIVE_KEY = re.compile(
    r"(?i)(password|secret|token|authorization|cookie|api[-_]?key|database_url|dsn|credential|"
    r"contact_email|contact_phone|contact_name|email|phone)"
)


def redact_text(value: str) -> str:
    """Hide database userinfo and bearer tokens inside a log message."""
    without_userinfo = _URL_USERINFO.sub(r"\1***@", value)
    return _BEARER.sub("Bearer ***", without_userinfo)


def is_sensitive_key(key: str) -> bool:
    return _SENSITIVE_KEY.search(key) is not None
