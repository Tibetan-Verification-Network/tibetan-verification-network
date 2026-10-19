"""JSON logs that keep request ids and drop credentials."""

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any, TextIO

from app.core.context import request_id_context
from app.core.redaction import is_sensitive_key, redact_text

_IGNORED_LOG_FIELDS = frozenset(
    {
        "args",
        "asctime",
        "created",
        "exc_info",
        "exc_text",
        "filename",
        "funcName",
        "levelname",
        "levelno",
        "lineno",
        "message",
        "module",
        "msecs",
        "msg",
        "name",
        "pathname",
        "process",
        "processName",
        "relativeCreated",
        "stack_info",
        "taskName",
        "thread",
        "threadName",
        "color_message",
    }
)


class JsonLogHandler(logging.StreamHandler[TextIO]):
    """Marks handlers installed by this application so reconfiguration can replace them."""


class JsonFormatter(logging.Formatter):
    """Format one log record as a single JSON line."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_text(record.getMessage()),
            "request_id": request_id_context.get(),
        }
        for key, value in _extra_fields(record).items():
            payload[key] = _redact_value(key, value)
        if record.exc_info and record.exc_info[0] is not None:
            payload["error_type"] = record.exc_info[0].__name__
        return redact_text(json.dumps(payload, default=_unavailable, ensure_ascii=False))


def configure_logging(level: str) -> None:
    """Send application logs to stdout as JSON without removing test handlers."""
    root = logging.getLogger()
    root.setLevel(level.upper())
    root.handlers = [
        handler for handler in root.handlers if not isinstance(handler, JsonLogHandler)
    ]
    handler = JsonLogHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    logging.getLogger("uvicorn.access").disabled = True
    logging.getLogger("asyncpg").setLevel(logging.CRITICAL)


def build_log_config(level: str) -> dict[str, Any]:
    """Uvicorn logging configuration that uses the same JSON formatter."""
    resolved = level.upper()
    return {
        "version": 1,
        # Keep loggers created while the application was imported.
        "disable_existing_loggers": False,
        "formatters": {"json": {"()": "app.core.logging.JsonFormatter"}},
        "handlers": {
            "default": {
                "class": "logging.StreamHandler",
                "formatter": "json",
                "stream": "ext://sys.stdout",
            }
        },
        "root": {"handlers": ["default"], "level": resolved},
        "loggers": {
            "uvicorn": {"handlers": ["default"], "level": resolved, "propagate": False},
            "uvicorn.error": {"handlers": ["default"], "level": resolved, "propagate": False},
            "uvicorn.access": {"handlers": [], "level": "CRITICAL", "propagate": False},
            "asyncpg": {"level": "CRITICAL", "propagate": False},
        },
    }


def _extra_fields(record: logging.LogRecord) -> dict[str, object]:
    return {
        key: value
        for key, value in record.__dict__.items()
        if key not in _IGNORED_LOG_FIELDS and not key.startswith("_")
    }


def _redact_value(key: str, value: object) -> object:
    if is_sensitive_key(key):
        return "***"
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, dict):
        return {
            str(item_key): _redact_value(str(item_key), item) for item_key, item in value.items()
        }
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return "[unavailable]"


def _unavailable(_value: object) -> str:
    return "[unavailable]"
