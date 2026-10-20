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
        "submission_submitter_hmac_key": "production-submitter-hmac-key",
        "storage_endpoint_url": "https://s3.example.org",
        "storage_bucket": "tvn-prod-archive",
        "storage_access_key_id": "prod-access-key",
        "storage_secret_access_key": "prod-secret-key",
    }
    values.update(overrides)
    return Settings(**values, _env_file=None)
