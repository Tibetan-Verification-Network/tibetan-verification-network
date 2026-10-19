"""Request ids, CORS, and request logs stay free of credentials."""

import json
import logging
import re

from httpx import AsyncClient

from app.core.logging import JsonFormatter, build_log_config

_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


async def test_request_id_is_preserved_when_safe(client: AsyncClient) -> None:
    response = await client.get("/health", headers={"X-Request-ID": "trace-12345"})
    assert response.headers["x-request-id"] == "trace-12345"


async def test_request_id_is_replaced_when_unsafe(client: AsyncClient) -> None:
    response = await client.get("/health", headers={"X-Request-ID": "bad id\r\nX-Injected: 1"})
    request_id = response.headers["x-request-id"]
    assert "\n" not in request_id
    assert "\r" not in request_id
    assert _REQUEST_ID.fullmatch(request_id)


async def test_request_id_is_generated_when_missing(client: AsyncClient) -> None:
    response = await client.get("/missing")
    assert response.status_code == 404
    assert _REQUEST_ID.fullmatch(response.headers["x-request-id"])


async def test_cors_allows_only_the_configured_origin(client: AsyncClient) -> None:
    allowed = await client.options(
        "/api/v1",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert allowed.headers["access-control-allow-credentials"] == "true"

    rejected = await client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in rejected.headers


async def test_request_logs_omit_query_strings_and_headers(client: AsyncClient) -> None:
    handler = _CollectingHandler()
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger("app.request")
    previous = logger.level
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    try:
        await client.get(
            "/health",
            params={"token": "super-secret-token"},
            headers={"Authorization": "Bearer super-secret-token"},
        )
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous)

    assert handler.messages
    payload = json.loads(handler.messages[-1])
    rendered = handler.messages[-1]
    assert payload["path"] == "/health"
    assert payload["http_method"] == "GET"
    assert payload["status_code"] == 200
    assert payload["request_id"]
    assert "super-secret-token" not in rendered
    assert "Bearer" not in rendered
    assert "query" not in payload


def test_server_log_config_keeps_imported_loggers() -> None:
    config = build_log_config("info")
    assert config["disable_existing_loggers"] is False


def test_formatter_redacts_database_urls_and_sensitive_fields() -> None:
    record = logging.LogRecord(
        name="app.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="connecting to postgresql://tvn:super-secret@localhost:5432/tvn",
        args=(),
        exc_info=None,
    )
    record.database_url = "postgresql://tvn:super-secret@localhost:5432/tvn"
    record.password = "super-secret"
    record.color_message = "connecting with \x1b[31mcolor\x1b[0m"
    rendered = JsonFormatter().format(record)
    assert "super-secret" not in rendered
    assert "postgresql://***@localhost:5432/tvn" in rendered
    assert '"password": "***"' in rendered
    assert "color_message" not in rendered
    assert "\x1b" not in rendered


class _CollectingHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.messages.append(self.format(record))
