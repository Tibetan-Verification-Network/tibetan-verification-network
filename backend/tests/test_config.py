"""Configuration must fail closed and must not echo secrets."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.main import create_app
from tests.helpers import production_settings, settings_for_tests

_ROOT = Path(__file__).resolve().parents[2]


def test_missing_database_url_stops_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TVN_ENV_FILE", "")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    get_settings.cache_clear()
    with pytest.raises(ValidationError) as caught:
        create_app()
    assert "database_url" in str(caught.value)


def test_invalid_environment_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings(
            environment="staging",
            database_url="postgresql://tvn:password@localhost:5432/tvn",
            _env_file=None,
        )


def test_database_url_must_be_postgresql() -> None:
    with pytest.raises(ValidationError):
        Settings(
            environment="test",
            database_url="mysql://tvn:password@localhost/tvn",
            _env_file=None,
        )


def test_asyncpg_database_url_is_accepted() -> None:
    settings = settings_for_tests(
        database_url="postgresql+asyncpg://tvn:password@localhost:5432/tvn",
    )
    assert settings.database_url.get_secret_value().startswith("postgresql+asyncpg://")


def test_wildcard_cors_origin_is_rejected() -> None:
    with pytest.raises(ValidationError):
        settings_for_tests(cors_origins=["*"])


def test_cors_origins_are_read_from_a_comma_separated_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "HTTP://LOCALHOST:5173, http://127.0.0.1:5173")
    settings = Settings(
        environment="test",
        database_url="postgresql://tvn:password@localhost:5432/tvn",
        _env_file=None,
    )
    assert settings.cors_origins == ["http://localhost:5173", "http://127.0.0.1:5173"]


def test_production_rejects_local_password_insecure_origin_and_empty_cors() -> None:
    with pytest.raises(ValidationError):
        production_settings(
            database_url="postgresql://tvn:tvn_local_dev@db.internal:5432/tvn",
        )
    with pytest.raises(ValidationError):
        production_settings(cors_origins=["http://verify.example.org"])
    with pytest.raises(ValidationError):
        production_settings(cors_origins=[])


def test_production_accepts_explicit_https_origins() -> None:
    settings = production_settings()
    assert settings.cors_origins == ["https://verify.example.org"]


def test_serialized_settings_hide_the_database_password() -> None:
    settings = settings_for_tests(
        database_url="postgresql://tvn:distinct-db-password@localhost:5432/tvn",
    )
    assert "distinct-db-password" not in settings.model_dump_json()
    assert "distinct-db-password" not in str(settings.database_url)
    assert "distinct-db-password" not in repr(settings)


def test_unrelated_environment_secrets_are_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PASSWORD", "super-secret-password")
    monkeypatch.setenv("API_TOKEN", "super-secret-token")
    settings = settings_for_tests()
    rendered = settings.model_dump_json()
    assert "super-secret-password" not in rendered
    assert "super-secret-token" not in rendered


def test_production_application_hides_api_docs() -> None:
    application = create_app(production_settings())
    assert application.docs_url is None
    assert application.redoc_url is None
    assert application.openapi_url is None


def test_openapi_schema_contains_no_configuration() -> None:
    schema = json.dumps(create_app(settings_for_tests()).openapi())
    assert "database_url" not in schema
    assert "tvn_local_dev" not in schema
    assert "session_cookie_secure" not in schema


def test_repository_examples_keep_secrets_out_of_source() -> None:
    example = (_ROOT / ".env.example").read_text(encoding="utf-8")
    gitignore = (_ROOT / ".gitignore").read_text(encoding="utf-8")
    compose = (_ROOT / "compose.yaml").read_text(encoding="utf-8")
    assert "tvn_local_dev" in example
    assert ".env" in gitignore
    assert "!.env.example" in gitignore
    for name in ("postgres:", "api:", "frontend:", "tvn-postgres-data"):
        assert name in compose
    assert "127.0.0.1:5432:5432" in compose
    assert "127.0.0.1:8000:8000" in compose
    assert "127.0.0.1:5173:5173" in compose
