"""Liveness stays process-only. Readiness reports database connectivity."""

import logging

import pytest
from httpx import AsyncClient

from app.core.logging import JsonFormatter
from app.db.readiness import database_is_ready


async def test_health_does_not_check_the_database(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def explode(database_url: str, timeout_seconds: float) -> bool:
        raise AssertionError(database_url or timeout_seconds)

    monkeypatch.setattr("app.api.routes.health.database_is_ready", explode)
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert "database" not in response.text


async def test_ready_reports_successful_connectivity(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[str] = []

    async def connected(
        database_url: str,
        timeout_seconds: float,
        *,
        engine: object | None = None,
    ) -> bool:
        assert engine is None
        seen.append(database_url)
        assert timeout_seconds == 1
        return True

    monkeypatch.setattr("app.api.routes.health.database_is_ready", connected)
    response = await client.get("/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
    assert seen == ["postgresql://tvn:tvn_local_dev@127.0.0.1:5432/tvn"]
    assert "tvn_local_dev" not in response.text


async def test_ready_is_unavailable_when_the_probe_fails(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def unavailable(
        database_url: str,
        timeout_seconds: float,
        *,
        engine: object | None = None,
    ) -> bool:
        assert engine is None
        assert database_url
        assert timeout_seconds
        return False

    monkeypatch.setattr("app.api.routes.health.database_is_ready", unavailable)
    response = await client.get("/ready")
    assert response.status_code == 503
    assert response.json() == {"status": "not_ready"}


async def test_unreachable_database_is_not_ready_and_logs_no_credentials() -> None:
    handler = _CollectingHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    previous_level = root.level
    root.setLevel(logging.DEBUG)
    root.addHandler(handler)
    try:
        ready = await database_is_ready(
            "postgresql://tvn:distinct-db-password@127.0.0.1:1/tvn",
            timeout_seconds=1,
        )
    finally:
        root.removeHandler(handler)
        root.setLevel(previous_level)
    assert ready is False
    rendered = "\n".join(handler.messages)
    assert "distinct-db-password" not in rendered
    assert "database_unavailable" in rendered


async def test_service_metadata_exposes_no_configuration(client: AsyncClient) -> None:
    response = await client.get("/api/v1")
    assert response.status_code == 200
    assert response.json() == {
        "name": "Tibetan Verification Network",
        "version": "0.1.0",
    }


class _CollectingHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.messages.append(self.format(record))
