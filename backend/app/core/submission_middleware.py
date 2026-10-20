"""Request guards specific to the public submission endpoint."""

from __future__ import annotations

import json

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send


class SubmissionBodyLimitMiddleware:
    """Reject oversized bodies before the public submission handler runs."""

    def __init__(self, app: ASGIApp, *, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path")
        method = scope.get("method")
        if path != "/api/v1/submissions" or method != "POST":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        content_length = headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > self.max_bytes:
                    await _reject(send)
                    return
            except ValueError:
                await _reject(send)
                return

        await self.app(scope, receive, send)


async def _reject(send: Send) -> None:
    body = json.dumps({"detail": "Request body is too large"}).encode("utf-8")
    await send(
        {
            "type": "http.response.start",
            "status": 413,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})
