"""Parse Markdown safely for editor preview and publication."""

from __future__ import annotations

import re
import unicodedata
from urllib.parse import urlparse

import nh3
from markdown_it import MarkdownIt

from app.core.text_validation import assert_submission_text

_MD = MarkdownIt("commonmark", {"html": False, "linkify": True})

_UNSAFE_LINK_DEST_RE = re.compile(r"\((?:javascript|data):[^)]*\)", re.IGNORECASE)

_ALLOWED_TAGS: set[str] = {
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "strong",
    "em",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "a",
    "br",
}

_LINK_SCHEME_RE = re.compile(r"^https?://", re.IGNORECASE)


def _validate_markdown_text(value: str, *, field_name: str) -> str:
    assert_submission_text(value, field_name=field_name)
    return unicodedata.normalize("NFC", value)


def _attribute_filter(tag: str, attr: str, value: str) -> str | None:
    if tag != "a" or attr != "href":
        return value
    parsed = urlparse(value.strip())
    if parsed.scheme.lower() not in {"http", "https"}:
        return None
    if not _LINK_SCHEME_RE.match(value.strip()):
        return None
    return value


def render_sanitized_html(markdown_text: str, *, field_name: str = "markdown") -> str:
    """Parse Markdown and return HTML safe for browser rendering."""
    if not markdown_text.strip():
        return ""
    normalized = _validate_markdown_text(markdown_text, field_name=field_name)
    normalized = _UNSAFE_LINK_DEST_RE.sub("(#)", normalized)
    raw_html = _MD.render(normalized)
    return nh3.clean(
        raw_html,
        tags=_ALLOWED_TAGS,
        attributes={
            "a": {"href"},
            "th": {"colspan", "rowspan"},
            "td": {"colspan", "rowspan"},
        },
        link_rel="nofollow noopener noreferrer",
        url_schemes={"http", "https"},
        attribute_filter=_attribute_filter,
    )
