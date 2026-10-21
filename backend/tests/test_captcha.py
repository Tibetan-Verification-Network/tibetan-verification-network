"""Captcha verifier selection and disabled-by-default behaviour."""

from pydantic import SecretStr

from app.core.config import Settings
from app.services.captcha import (
    DisabledCaptchaVerifier,
    TurnstileCaptchaVerifier,
    captcha_verifier_for,
)


async def test_captcha_disabled_by_default() -> None:
    settings = Settings(
        environment="test",
        database_url="postgresql://tvn:tvn_local_dev@127.0.0.1:5432/tvn",
    )
    verifier = captcha_verifier_for(settings)
    assert isinstance(verifier, DisabledCaptchaVerifier)
    assert await verifier.verify(None, remote_ip="127.0.0.1")


async def test_turnstile_verifier_when_enabled() -> None:
    settings = Settings(
        environment="test",
        database_url="postgresql://tvn:tvn_local_dev@127.0.0.1:5432/tvn",
        submission_captcha_enabled=True,
        turnstile_secret_key=SecretStr("test-secret"),
    )
    verifier = captcha_verifier_for(settings)
    assert isinstance(verifier, TurnstileCaptchaVerifier)
