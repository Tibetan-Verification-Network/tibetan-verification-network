"""Typed process configuration. The application refuses to start when it is invalid."""

import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal, Self
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_serializer, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from app.core.constants import LOCAL_DEVELOPMENT_DATABASE_PASSWORD

_DATABASE_URL = re.compile(r"^postgres(?:ql)?(?:\+asyncpg)?://\S+$")


def resolve_env_file() -> str | None:
    """Locate a dotenv file without treating a missing file as an error."""
    override = os.environ.get("TVN_ENV_FILE")
    if override is not None:
        return None if override == "" else override
    candidates = (
        Path.cwd() / ".env",
        Path(__file__).resolve().parents[3] / ".env",
    )
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return None


class Settings(BaseSettings):
    """Runtime settings loaded from the process environment."""

    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    environment: Literal["development", "test", "production"] = "development"
    log_level: Literal["debug", "info", "warning", "error", "critical"] = "info"
    database_url: SecretStr
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)
    api_host: str = "127.0.0.1"
    api_port: int = Field(default=8000, ge=1, le=65535)
    readiness_timeout_seconds: float = Field(default=2.0, gt=0, le=30)
    session_ttl_hours: int = Field(default=168, ge=1, le=24 * 30)
    invite_ttl_hours: int = Field(default=168, ge=1, le=24 * 30)
    password_min_length: int = Field(default=12, ge=8, le=128)
    session_cookie_name: str = "tvn_session"
    session_cookie_secure: bool | None = None
    submission_max_body_bytes: int = Field(default=32_768, ge=1024, le=256_000)
    submission_rate_limit_ip_max: int = Field(default=20, ge=1, le=10_000)
    submission_rate_limit_ip_window_seconds: int = Field(default=3600, ge=60, le=86_400)
    submission_rate_limit_global_max: int = Field(default=500, ge=1, le=1_000_000)
    submission_rate_limit_global_window_seconds: int = Field(default=3600, ge=60, le=86_400)
    submission_duplicate_similarity_threshold: float = Field(default=0.35, ge=0.1, le=0.99)
    submission_submitter_hmac_key: SecretStr = SecretStr("local-dev-submitter-hmac-key")
    submission_captcha_enabled: bool = False
    turnstile_secret_key: SecretStr | None = None
    trust_forwarded_for: bool = False
    trusted_hosts: Annotated[list[str], NoDecode] = Field(default_factory=list)
    proxy_headers: bool = False
    sentry_dsn: SecretStr | None = None
    storage_endpoint_url: str | None = None
    storage_bucket: str = "tvn-archive-local"
    storage_access_key_id: SecretStr = SecretStr("minioadmin")
    storage_secret_access_key: SecretStr = SecretStr("minioadmin")
    storage_region: str = "us-east-1"
    archive_max_upload_bytes: int = Field(default=26_214_400, ge=1024, le=104_857_600)
    archive_signed_url_ttl_seconds: int = Field(default=120, ge=30, le=3600)

    @field_validator("session_cookie_name")
    @classmethod
    def check_session_cookie_name(cls, value: str) -> str:
        invalid = any(
            not character.isalnum() and character not in {"_", "-"} for character in value
        )
        if not value or invalid:
            raise ValueError("Session cookie name must be a safe token")
        return value

    @model_validator(mode="after")
    def default_session_cookie_secure(self) -> Self:
        if self.session_cookie_secure is None:
            object.__setattr__(self, "session_cookie_secure", self.environment == "production")
        return self

    @field_validator("database_url")
    @classmethod
    def check_database_url(cls, value: SecretStr) -> SecretStr:
        url = value.get_secret_value()
        if len(url) > 2048 or any(ord(character) < 32 for character in url):
            raise ValueError("DATABASE_URL must be a PostgreSQL connection URL")
        if not _DATABASE_URL.fullmatch(url):
            raise ValueError("DATABASE_URL must be a PostgreSQL connection URL")
        parsed = urlsplit(url)
        if parsed.hostname is None or parsed.username is None or not parsed.password:
            raise ValueError("DATABASE_URL must include a user, password, host, and database name")
        if parsed.path in {"", "/"}:
            raise ValueError("DATABASE_URL must include a database name")
        return value

    @field_validator("cors_origins", "trusted_hosts", mode="before")
    @classmethod
    def split_comma_separated(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("cors_origins")
    @classmethod
    def check_cors_origins(cls, value: list[str]) -> list[str]:
        return [_normalize_origin(origin) for origin in value]

    @field_validator("api_host")
    @classmethod
    def check_api_host(cls, value: str) -> str:
        if value.strip() == "":
            raise ValueError("API host must not be empty")
        return value

    @field_serializer("database_url")
    def hide_database_url(self, _value: SecretStr) -> str:
        return "**********"

    @model_validator(mode="after")
    def check_production_constraints(self) -> Self:
        if self.environment != "production":
            return self
        if not self.cors_origins:
            raise ValueError("Production requires at least one CORS origin")
        for origin in self.cors_origins:
            if urlsplit(origin).scheme != "https":
                raise ValueError("Production CORS origins must use https")
        password = urlsplit(self.database_url.get_secret_value()).password
        if password == LOCAL_DEVELOPMENT_DATABASE_PASSWORD:
            raise ValueError("Production database URL must not use the local development password")
        if self.submission_submitter_hmac_key.get_secret_value() == "local-dev-submitter-hmac-key":
            raise ValueError("Production requires a dedicated submission submitter HMAC key")
        if not self.storage_endpoint_url:
            raise ValueError("Production requires STORAGE_ENDPOINT_URL")
        parsed_storage = urlsplit(self.storage_endpoint_url)
        if parsed_storage.scheme != "https":
            raise ValueError("Production storage endpoint must use https")
        if self.storage_bucket in {"tvn-archive-local", "test", "tvn"}:
            raise ValueError("Production storage bucket must not use a default placeholder name")
        if self.storage_access_key_id.get_secret_value() == "minioadmin":
            raise ValueError("Production requires dedicated storage credentials")
        if self.submission_captcha_enabled and self.turnstile_secret_key is None:
            raise ValueError("Production captcha requires TURNSTILE_SECRET_KEY")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    env_file = resolve_env_file()

    class LoadedSettings(Settings):
        model_config = SettingsConfigDict(
            env_file=env_file,
            env_file_encoding="utf-8",
            extra="ignore",
            case_sensitive=False,
        )

    # Values come from the environment and an optional dotenv file, not from this call.
    return LoadedSettings()  # type: ignore[call-arg]


def _normalize_origin(origin: str) -> str:
    if origin == "*":
        raise ValueError("CORS origins must be explicit")
    parsed = urlsplit(origin)
    if parsed.scheme not in {"http", "https"} or parsed.hostname is None:
        raise ValueError("CORS origins must be http or https URLs")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("CORS origins must not include credentials, queries, or fragments")
    if parsed.path not in {"", "/"}:
        raise ValueError("CORS origins must not include a path")
    host = parsed.hostname
    if ":" in host:
        host = f"[{host}]"
    port = f":{parsed.port}" if parsed.port is not None else ""
    return f"{parsed.scheme}://{host}{port}"
