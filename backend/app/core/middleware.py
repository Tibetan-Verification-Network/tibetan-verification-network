"""Attach a safe request id and write one redacted access line per request."""

import logging
import re
import time
from uuid import uuid4

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.context import request_id_context

_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
_logger = logging.getLogger("app.request")


class RequestIdMiddleware:
    """Outermost middleware: every response gets one validated request id."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = _request_id(Headers(scope=scope).get("x-request-id"))
        token = request_id_context.set(request_id)
        started = time.perf_counter()
        status_code = 500

        async def send_with_request_id(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message["status"])
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode("ascii")))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            method = scope.get("method")
            path = scope.get("path")
            _logger.info(
                "request completed",
                extra={
                    "http_method": method if isinstance(method, str) else "",
                    "path": path if isinstance(path, str) else "",
                    "status_code": status_code,
                    "duration_ms": duration_ms,
                },
            )
            request_id_context.reset(token)


def _request_id(incoming: str | None) -> str:
    if incoming and _REQUEST_ID_PATTERN.fullmatch(incoming):
        return incoming
    return str(uuid4())
