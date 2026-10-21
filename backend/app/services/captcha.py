"""Optional Cloudflare Turnstile verification (disabled by default until launch)."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import Settings

logger = logging.getLogger(__name__)

_TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


class CaptchaVerifier(Protocol):
    async def verify(self, token: str | None, *, remote_ip: str | None) -> bool: ...


@dataclass(frozen=True, slots=True)
class DisabledCaptchaVerifier:
    async def verify(self, token: str | None, *, remote_ip: str | None) -> bool:
        return True


@dataclass(frozen=True, slots=True)
class TurnstileCaptchaVerifier:
    secret_key: str

    async def verify(self, token: str | None, *, remote_ip: str | None) -> bool:
        if not token or not token.strip():
            return False
        body = urlencode(
            {
                "secret": self.secret_key,
                "response": token.strip(),
                **({"remoteip": remote_ip} if remote_ip else {}),
            }
        ).encode()
        request = Request(
            _TURNSTILE_VERIFY_URL,
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )

        def post_verify() -> bool:
            try:
                with urlopen(request, timeout=10) as response:
                    payload = json.loads(response.read().decode())
            except (OSError, json.JSONDecodeError, ValueError):
                logger.warning("Turnstile verification request failed")
                return False
            return bool(payload.get("success"))

        return await asyncio.to_thread(post_verify)


def captcha_verifier_for(settings: Settings) -> CaptchaVerifier:
    if not settings.submission_captcha_enabled:
        return DisabledCaptchaVerifier()
    secret = settings.turnstile_secret_key
    if secret is None:
        raise RuntimeError("SUBMISSION_CAPTCHA_ENABLED requires TURNSTILE_SECRET_KEY")
    return TurnstileCaptchaVerifier(secret_key=secret.get_secret_value())
