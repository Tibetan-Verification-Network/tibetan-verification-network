"""Workflow transition failures."""

from __future__ import annotations

from enum import StrEnum


class InvalidTransitionError(Exception):
    """Raised when a status change is not allowed by the transition table."""

    def __init__(
        self,
        *,
        subject: str,
        from_status: str,
        to_status: str,
    ) -> None:
        self.subject = subject
        self.from_status = from_status
        self.to_status = to_status
        super().__init__(
            f"{subject}: invalid transition from {from_status!r} to {to_status!r}",
        )


class TransitionBlockedError(Exception):
    """Raised when guards block an otherwise valid transition."""

    def __init__(self, *, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


class GuardCode(StrEnum):
    INVESTIGATION_FROZEN = "investigation_frozen"
    NOT_AUTHOR = "not_author"
    IS_AUTHOR = "is_author"
    NOT_APPROVING_REVIEWER = "not_approving_reviewer"
    IS_READY_MARKING_EDITOR = "is_ready_marking_editor"
    READINESS_FAILED = "readiness_failed"
