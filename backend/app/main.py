"""Application factory for the Tibetan Verification Network API."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.routes.admin import router as admin_router
from app.api.routes.archive import archive_router, investigation_archive_router
from app.api.routes.auth import router as auth_router
from app.api.routes.editorial import router as editorial_router
from app.api.routes.factchecks import editorial_factcheck_router, investigation_factcheck_router
from app.api.routes.health import router as health_router
from app.api.routes.investigations import router as investigations_router
from app.api.routes.me import router as me_router
from app.api.routes.public_factchecks import router as public_factchecks_router
from app.api.routes.public_topics import router as public_topics_router
from app.api.routes.service import router as service_router
from app.api.routes.submissions import router as submissions_router
from app.core.config import Settings, get_settings
from app.core.constants import API_VERSION, PRODUCT_NAME
from app.core.logging import build_log_config, configure_logging
from app.core.middleware import RequestIdMiddleware
from app.core.security import CSRF_HEADER_NAME
from app.core.sentry import init_sentry
from app.core.submission_middleware import SubmissionBodyLimitMiddleware
from app.db.lifecycle import database_lifespan


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build an API instance. Missing or invalid settings raise before it serves traffic."""
    resolved = settings if settings is not None else get_settings()
    configure_logging(resolved.log_level)
    init_sentry(resolved)
    expose_docs = resolved.environment != "production"

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with database_lifespan(app):
            yield

    app = FastAPI(
        title=PRODUCT_NAME,
        version=API_VERSION,
        docs_url="/docs" if expose_docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if expose_docs else None,
        lifespan=lifespan,
    )
    app.state.settings = resolved
    if resolved.trusted_hosts:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=resolved.trusted_hosts)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Accept", "Content-Type", "X-Request-ID", CSRF_HEADER_NAME],
        expose_headers=["X-Request-ID"],
    )
    app.add_middleware(
        SubmissionBodyLimitMiddleware,
        max_bytes=resolved.submission_max_body_bytes,
    )
    app.add_middleware(RequestIdMiddleware)
    app.include_router(health_router)
    app.include_router(service_router, prefix="/api/v1")
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(me_router, prefix="/api/v1")
    app.include_router(admin_router, prefix="/api/v1")
    app.include_router(editorial_router, prefix="/api/v1")
    app.include_router(submissions_router, prefix="/api/v1")
    app.include_router(public_factchecks_router, prefix="/api/v1")
    app.include_router(public_topics_router, prefix="/api/v1")
    app.include_router(investigations_router, prefix="/api/v1")
    app.include_router(investigation_factcheck_router, prefix="/api/v1")
    app.include_router(editorial_factcheck_router, prefix="/api/v1")
    app.include_router(investigation_archive_router, prefix="/api/v1")
    app.include_router(archive_router, prefix="/api/v1")
    return app


app = create_app()


def run() -> None:
    """Start the API with JSON logs and without proxy-header trust."""
    settings = get_settings()
    # Uvicorn installs its own handlers. Drop the import-time handler first.
    logging.getLogger().handlers.clear()
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        access_log=False,
        proxy_headers=settings.proxy_headers,
        forwarded_allow_ips="*" if settings.proxy_headers else None,
        log_config=build_log_config(settings.log_level),
    )


if __name__ == "__main__":
    run()
