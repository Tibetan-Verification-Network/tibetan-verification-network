"""Shared settings builders for API tests."""

from typing import Any

from app.core.config import Settings


def settings_for_tests(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "environment": "test",
        "database_url": "postgresql://tvn:tvn_local_dev@127.0.0.1:5432/tvn",
        "cors_origins": ["http://localhost:5173"],
        "log_level": "warning",
        "readiness_timeout_seconds": 1,
    }
    values.update(overrides)
    return Settings(**values, _env_file=None)


def production_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "environment": "production",
        "database_url": "postgresql://tvn:production-password@db.internal:5432/tvn",
        "cors_origins": ["https://verify.example.org"],
        "log_level": "info",
    }
    values.update(overrides)
    return Settings(**values, _env_file=None)
