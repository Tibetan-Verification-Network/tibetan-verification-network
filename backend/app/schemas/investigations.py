"""Investigation workspace API schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.db.enums import EvidenceStance, InvestigationAssignmentRole, WorkflowStatus
from app.schemas.intake import ClaimSummaryResponse


class InvestigationCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claim_id: uuid.UUID | None = None
    submission_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def require_exactly_one_origin(self) -> InvestigationCreateRequest:
        if (self.claim_id is None) == (self.submission_id is None):
            raise ValueError("Provide exactly one of claim_id or submission_id")
        return self


class InvestigationPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    internal_notes: str | None = None


class InvestigationStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal[
        WorkflowStatus.RESEARCHING,
        WorkflowStatus.DRAFTING,
        WorkflowStatus.ON_HOLD,
        WorkflowStatus.REJECTED,
    ]
    reason: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def require_reason_for_hold(self) -> InvestigationStatusRequest:
        if self.status in {WorkflowStatus.ON_HOLD, WorkflowStatus.REJECTED} and not (
            self.reason and self.reason.strip()
        ):
            raise ValueError("reason is required when status is on_hold or rejected")
        return self


class AssignmentCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: uuid.UUID
    assignment_role: InvestigationAssignmentRole = InvestigationAssignmentRole.CONTRIBUTOR


class AssignmentSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    assignment_role: InvestigationAssignmentRole
    assigned_by_id: uuid.UUID | None
    assigned_at: datetime
    removed_at: datetime | None = None


class SourceCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=500)
    url: str | None = Field(default=None, max_length=2048)
    publisher: str | None = Field(default=None, max_length=300)
    author: str | None = Field(default=None, max_length=300)
    published_at: datetime | None = None
    retrieved_at: datetime | None = None
    source_language: str | None = Field(default=None, max_length=40)
    reliability_notes: str | None = None
    position: int | None = None


class SourcePatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=500)
    url: str | None = Field(default=None, max_length=2048)
    publisher: str | None = Field(default=None, max_length=300)
    author: str | None = Field(default=None, max_length=300)
    published_at: datetime | None = None
    retrieved_at: datetime | None = None
    source_language: str | None = Field(default=None, max_length=40)
    reliability_notes: str | None = None
    position: int | None = None


class SourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    investigation_id: uuid.UUID
    title: str
    url: str | None
    normalized_url: str | None
    publisher: str | None
    author: str | None
    published_at: datetime | None
    retrieved_at: datetime | None
    source_language: str | None
    reliability_notes: str | None
    position: int | None
    created_at: datetime
    updated_at: datetime
    created_by_id: uuid.UUID | None
    updated_by_id: uuid.UUID | None


class EvidenceCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    excerpt: str | None = None
    notes: str | None = None
    stance: EvidenceStance | None = None
    source_id: uuid.UUID | None = None
    archive_document_id: uuid.UUID | None = None
    position: int | None = None


class EvidencePatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    excerpt: str | None = None
    notes: str | None = None
    stance: EvidenceStance | None = None
    source_id: uuid.UUID | None = None
    archive_document_id: uuid.UUID | None = None
    position: int | None = None


class EvidenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    investigation_id: uuid.UUID
    excerpt: str | None
    notes: str | None
    stance: EvidenceStance | None
    source_id: uuid.UUID | None
    archive_document_id: uuid.UUID | None
    position: int | None
    verified_at: datetime | None
    verified_by_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    created_by_id: uuid.UUID | None
    updated_by_id: uuid.UUID | None


class ReorderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ordered_ids: Annotated[list[uuid.UUID], Field(min_length=1)]


class InvestigationSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    claim_id: uuid.UUID
    owner_id: uuid.UUID | None
    workflow_status: WorkflowStatus
    created_at: datetime
    updated_at: datetime


class InvestigationDetailResponse(BaseModel):
    investigation: InvestigationSummaryResponse
    claim: ClaimSummaryResponse
    internal_notes: str | None
    hold_reason: str | None
    reject_reason: str | None
    assignments: list[AssignmentSummaryResponse]
    sources: list[SourceResponse]
    evidence_items: list[EvidenceResponse]


class InvestigationListResponse(BaseModel):
    items: list[InvestigationSummaryResponse]
    next_cursor: str | None
