"""HttpOnly session cookie helpers."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import Response

from app.core.config import Settings


def set_session_cookie(
    response: Response,
    *,
    settings: Settings,
    raw_session_token: str,
    expires_at: datetime,
) -> None:
    max_age = max(int((expires_at - datetime.now(tz=UTC)).total_seconds()), 0)
    response.set_cookie(
        key=settings.session_cookie_name,
        value=raw_session_token,
        httponly=True,
        secure=bool(settings.session_cookie_secure),
        samesite="lax",
        max_age=max_age,
        path="/",
    )


def clear_session_cookie(response: Response, *, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        httponly=True,
        secure=bool(settings.session_cookie_secure),
        samesite="lax",
    )
