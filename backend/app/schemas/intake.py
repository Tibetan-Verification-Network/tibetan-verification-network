"""Public submission and editorial intake API schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.db.enums import SubmissionChannel, WorkflowStatus


class SubmissionContactInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)


class PublicSubmissionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claim_text: str = Field(min_length=10, max_length=5000)
    context_text: str | None = Field(default=None, max_length=5000)
    source_url: str | None = Field(default=None, max_length=2048)
    contact: SubmissionContactInput | None = None
    privacy_consent: bool = False
    website: str = Field(default="", max_length=200)

    @model_validator(mode="after")
    def require_privacy_consent_for_contact(self) -> PublicSubmissionRequest:
        if self.contact is None:
            return self
        has_contact = any([self.contact.name, self.contact.email, self.contact.phone])
        if has_contact and not self.privacy_consent:
            raise ValueError("privacy_consent must be true when contact information is supplied")
        return self


class SubmissionReceiptResponse(BaseModel):
    receipt_id: uuid.UUID


class SubmissionSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    claim_text: str
    context_text: str | None
    source_url: str | None
    channel: SubmissionChannel
    workflow_status: WorkflowStatus
    claim_id: uuid.UUID | None
    assigned_to_id: uuid.UUID | None
    duplicate_of_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class ClaimSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    canonical_text: str
    context_summary: str | None
    created_at: datetime
    updated_at: datetime


class DuplicateSuggestionResponse(BaseModel):
    id: uuid.UUID
    claim_text: str
    workflow_status: WorkflowStatus
    similarity: float | None = None
    exact_match: bool = False


class SubmissionDetailResponse(BaseModel):
    submission: SubmissionSummaryResponse
    claim: ClaimSummaryResponse | None
    duplicate_suggestions: list[DuplicateSuggestionResponse]


class SubmissionContactResponse(BaseModel):
    contact_name: str | None
    contact_email: str | None
    contact_phone: str | None
    privacy_notice_acknowledged: bool


class SubmissionListResponse(BaseModel):
    items: list[SubmissionSummaryResponse]
    next_cursor: str | None


class ClaimListResponse(BaseModel):
    items: list[ClaimSummaryResponse]
    next_cursor: str | None


class ClaimDetailResponse(BaseModel):
    claim: ClaimSummaryResponse
    submissions: list[SubmissionSummaryResponse]


class TriageRejectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["reject"]
    reason: str = Field(min_length=3, max_length=2000)


class TriageHoldRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["hold"]
    reason: str = Field(min_length=3, max_length=2000)


class TriageMarkDuplicateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["mark_duplicate"]
    duplicate_of_id: uuid.UUID


class TriageLinkClaimRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["link_to_claim"]
    claim_id: uuid.UUID


class TriageCreateClaimRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["create_claim"]
    canonical_text: str = Field(min_length=3, max_length=5000)


class TriageAssignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["assign"]
    user_id: uuid.UUID


class TriageOpenInvestigationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["open_investigation"]


TriageRequest = Annotated[
    TriageRejectRequest
    | TriageHoldRequest
    | TriageMarkDuplicateRequest
    | TriageLinkClaimRequest
    | TriageCreateClaimRequest
    | TriageAssignRequest
    | TriageOpenInvestigationRequest,
    Field(discriminator="action"),
]
