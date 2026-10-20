"""Normalize published copy for bilingual public search."""

from __future__ import annotations

import re
import unicodedata

TSHEG = "\u0f0b"
SHAD = "\u0f0d"
LATIN_LOWER_RE = re.compile(r"[a-z0-9]+", re.ASCII)
STRIP_PUNCT_RE = re.compile(r"[\s\W_]+", re.UNICODE)


def normalize_unicode(text: str) -> str:
    return unicodedata.normalize("NFC", text)


def strip_tibetan_separators(text: str) -> str:
    return text.replace(TSHEG, " ").replace(SHAD, " ")


def tibetan_syllable_tokens(text: str) -> list[str]:
    """Split Tibetan script on tsheg into non-empty syllable tokens."""
    normalized = normalize_unicode(strip_tibetan_separators(text))
    parts = normalized.split()
    tokens: list[str] = []
    for part in parts:
        token = part.strip()
        if token:
            tokens.append(token)
    return tokens


def latin_tokens(text: str) -> list[str]:
    normalized = normalize_unicode(text).lower()
    return LATIN_LOWER_RE.findall(normalized)


def build_search_fields(
    *,
    title: str,
    summary: str | None,
    claim_text: str,
    context_text: str,
    analysis_markdown: str,
    verdict_explanation: str,
) -> tuple[str, list[str]]:
    """Return (search_text, search_tokens) for a published language version."""
    chunks = [
        title,
        summary or "",
        claim_text,
        context_text,
        analysis_markdown,
        verdict_explanation,
    ]
    combined = normalize_unicode("\n".join(chunks))
    combined = strip_tibetan_separators(combined)

    search_text = STRIP_PUNCT_RE.sub(" ", combined.lower()).strip()
    search_text = re.sub(r"\s+", " ", search_text)

    token_set: list[str] = []
    seen: set[str] = set()
    for chunk in chunks:
        for token in tibetan_syllable_tokens(chunk):
            if token not in seen:
                seen.add(token)
                token_set.append(token)
        for token in latin_tokens(chunk):
            if token not in seen:
                seen.add(token)
                token_set.append(token)

    return search_text, token_set
