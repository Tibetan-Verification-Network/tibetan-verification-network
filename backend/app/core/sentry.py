"""Optional Sentry integration with PII-safe defaults."""

from __future__ import annotations

import logging

from app.core.config import Settings

logger = logging.getLogger(__name__)


def init_sentry(settings: Settings) -> None:
    if settings.sentry_dsn is None:
        return
    try:
        import sentry_sdk  # type: ignore[import-not-found]
        from sentry_sdk.integrations.fastapi import (  # type: ignore[import-not-found]
            FastApiIntegration,
        )
    except ImportError:
        logger.warning("SENTRY_DSN is set but sentry-sdk is not installed")
        return

    dsn = settings.sentry_dsn.get_secret_value()
    if not dsn:
        return

    sentry_sdk.init(
        dsn=dsn,
        environment=settings.environment,
        integrations=[FastApiIntegration()],
        send_default_pii=False,
        max_request_body_size="never",
    )
