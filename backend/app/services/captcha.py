"""Optional captcha verification (disabled by default until launch)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.core.config import Settings


class CaptchaVerifier(Protocol):
    async def verify(self, token: str | None, *, remote_ip: str | None) -> bool: ...


@dataclass(frozen=True, slots=True)
class DisabledCaptchaVerifier:
    async def verify(self, token: str | None, *, remote_ip: str | None) -> bool:
        return True


def captcha_verifier_for(settings: Settings) -> CaptchaVerifier:
    if settings.submission_captcha_enabled:
        raise RuntimeError("Submission captcha is not configured")
    return DisabledCaptchaVerifier()
