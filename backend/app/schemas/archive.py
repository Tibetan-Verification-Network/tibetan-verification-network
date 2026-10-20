"""Archive document API schemas (metadata only; no storage keys)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.db.enums import ArchiveUploadStatus, ArchiveVisibility


class ArchiveDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    visibility: ArchiveVisibility
    mime_type: str | None
    byte_size: int | None
    investigation_id: uuid.UUID | None
    original_filename: str | None
    sha256: str | None
    upload_status: ArchiveUploadStatus
    classified_by_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class ArchiveDocumentListResponse(BaseModel):
    items: list[ArchiveDocumentResponse]
    next_cursor: str | None = None


class ArchiveClassificationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    visibility: ArchiveVisibility
    reason: str = Field(min_length=1, max_length=5000)


class ArchiveGrantCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: uuid.UUID
    expires_at: datetime | None = None


class ArchiveGrantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    granted_by_id: uuid.UUID | None
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime


class ArchiveGrantListResponse(BaseModel):
    items: list[ArchiveGrantResponse]


class ArchiveAccessLinkResponse(BaseModel):
    url: str
    expires_at: datetime


class ArchiveUploadFormMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=5000)
