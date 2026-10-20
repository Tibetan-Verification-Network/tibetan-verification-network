"""Services must not assign workflow or editorial status outside the engine."""

from __future__ import annotations

import re
from pathlib import Path

ASSIGNMENT_RE = re.compile(
    r"\.(?:workflow_status|editorial_status)\s=(?!=)",
)
SERVICE_ROOT = Path(__file__).resolve().parents[1] / "app" / "services"


def test_services_do_not_assign_workflow_or_editorial_status_directly() -> None:
    violations: list[str] = []
    for path in sorted(SERVICE_ROOT.rglob("*.py")):
        rel = path.relative_to(SERVICE_ROOT.parent).as_posix()
        for match in ASSIGNMENT_RE.finditer(path.read_text(encoding="utf-8")):
            violations.append(f"{rel}: {match.group(0)!r}")
    assert not violations, "Direct status assignment found:\n" + "\n".join(violations)
