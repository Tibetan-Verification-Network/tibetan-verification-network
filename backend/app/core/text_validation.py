"""Unicode normalization and safety checks for public text fields."""

from __future__ import annotations

import hashlib
import unicodedata

ALLOWED_CONTROL_CHARACTERS = frozenset({"\n", "\t"})


class TextValidationError(ValueError):
    """Raised when submitted text violates intake rules."""


def assert_submission_text(value: str, *, field_name: str) -> None:
    for character in value:
        if ord(character) < 32 and character not in ALLOWED_CONTROL_CHARACTERS:
            raise TextValidationError(f"{field_name} contains disallowed control characters")


def nfc_fingerprint(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()
