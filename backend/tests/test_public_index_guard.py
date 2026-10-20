"""public_articles rows may only be written from the publication/index services."""

from __future__ import annotations

import re
from pathlib import Path

PUBLIC_ARTICLE_WRITE_RE = re.compile(
    r"(?:PublicArticle\b|public_articles\b).*(?:\.add\(|insert\(|delete\()|"
    r"(?:session\.add\(\s*PublicArticle|insert\(PublicArticle)",
)
ALLOWED = frozenset(
    {
        "app/services/public_index.py",
        "app/services/publication.py",
    }
)
SERVICE_ROOT = Path(__file__).resolve().parents[1] / "app"


def test_public_index_writes_are_confined() -> None:
    violations: list[str] = []
    for path in sorted(SERVICE_ROOT.rglob("*.py")):
        rel = path.relative_to(SERVICE_ROOT.parent).as_posix()
        if rel in ALLOWED:
            continue
        text = path.read_text(encoding="utf-8")
        mentions_index = "PublicArticle" in text or "public_articles" in text
        if mentions_index and PUBLIC_ARTICLE_WRITE_RE.search(text):
            violations.append(rel)
    assert not violations, "Unexpected public index writes in: " + ", ".join(violations)
