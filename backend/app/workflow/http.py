"""Map workflow exceptions to HTTP responses."""

from __future__ import annotations

from fastapi import HTTPException, status

from app.workflow.exceptions import InvalidTransitionError, TransitionBlockedError


def http_conflict_from_transition(exc: InvalidTransitionError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "invalid_transition",
            "subject": exc.subject,
            "from_status": exc.from_status,
            "to_status": exc.to_status,
        },
    )


def http_conflict_from_guard(exc: TransitionBlockedError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": exc.code,
            "message": exc.message,
        },
    )
