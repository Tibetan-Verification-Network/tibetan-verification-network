"""Shared API-facing enumerations kept separate from ORM models."""

from enum import StrEnum


class LanguageCode(StrEnum):
    BO = "bo"
    EN = "en"


class PublicVerdict(StrEnum):
    TRUE = "true"
    FALSE = "false"
    MISLEADING = "misleading"
    UNVERIFIED = "unverified"
    UNCLEAR = "unclear"


class ArchiveVisibility(StrEnum):
    PUBLIC_METADATA = "public_metadata"
    PUBLIC_DOCUMENT = "public_document"
    INTERNAL = "internal"
    RESTRICTED = "restricted"
