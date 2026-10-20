"""Ensure editorial and investigation routes declare policy loaders."""

from __future__ import annotations

from app.api.deps.access import route_has_policy_loader
from app.main import create_app
from tests.helpers import settings_for_tests

STAFF_ONLY_ROUTES = frozenset({("GET", "/api/v1/editorial/status")})


def test_editorial_and_investigation_routes_use_policy_loaders() -> None:
    application = create_app(settings_for_tests())
    missing: list[str] = []
    for route in application.routes:
        path = getattr(route, "path", "")
        methods = getattr(route, "methods", set()) or set()
        if not path.startswith("/api/v1/"):
            continue
        if "/editorial" not in path and "/investigations" not in path and "/archive" not in path:
            continue
        for method in methods:
            if method in {"HEAD", "OPTIONS"}:
                continue
            key = (method, path)
            if key in STAFF_ONLY_ROUTES:
                continue
            if not route_has_policy_loader(route):
                missing.append(f"{method} {path}")
    assert not missing, "Routes missing policy loaders: " + ", ".join(sorted(missing))
