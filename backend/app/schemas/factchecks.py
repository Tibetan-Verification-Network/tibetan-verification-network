"""Fact-check editorial draft and publication snapshot schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.db.enums import (
    ArticleVersionKind,
    LanguageEditorialStatus,
    PublicVerdict,
    ReviewDecision,
    TranslationStatus,
    WorkflowStatus,
)
from app.schemas.common import LanguageCode


class PublicSnapshotSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    publisher: str | None = None
    url: str | None = None
    published_at: datetime | None = None
    relevance_note: str | None = None


class PublicArticleSnapshot(BaseModel):
    """Allow-listed public snapshot shape for Phase 4 reads (built at publish time)."""

    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(default=1, ge=1, le=2)
    language: LanguageCode
    public_slug: str
    title: str
    summary: str | None = None
    claim_text: str
    context_text: str
    verdict: PublicVerdict
    verdict_explanation: str
    analysis_markdown: str
    analysis_html: str
    limitations_markdown: str
    limitations_html: str
    sources: list[PublicSnapshotSource]
    topics: list[str] = Field(default_factory=list)
    translation_status: TranslationStatus
    attribution: str
    kind: ArticleVersionKind
    correction_note: str | None = None
    withdrawal_notice: str | None = None
    published_at: datetime


class DraftSourceReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: uuid.UUID
    relevance_note: str | None = Field(default=None, max_length=5000)
    position: int = Field(ge=0)


class DraftSourceReferenceResponse(DraftSourceReference):
    model_config = ConfigDict(from_attributes=True)


class FactCheckCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    languages: Annotated[list[LanguageCode], Field(min_length=1, max_length=2)]

    @field_validator("languages")
    @classmethod
    def unique_languages(cls, value: list[LanguageCode]) -> list[LanguageCode]:
        if len(value) != len(set(value)):
            raise ValueError("languages must not contain duplicates")
        return value


class FactCheckCreateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID
    investigation_id: uuid.UUID
    workflow_status: WorkflowStatus
    public_slug: str | None
    languages: list[LanguageCode]


class FactCheckSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    investigation_id: uuid.UUID | None
    workflow_status: WorkflowStatus
    public_slug: str | None
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime


class FactCheckLanguageBriefResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: LanguageCode
    editorial_status: LanguageEditorialStatus
    title: str | None


class FactCheckListItemResponse(FactCheckSummaryResponse):
    """List row: the summary plus enough per-language state to render a work queue."""

    languages: list[FactCheckLanguageBriefResponse]


class FactCheckListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[FactCheckListItemResponse]
    next_cursor: str | None


class FactCheckPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    public_slug: str = Field(min_length=1, max_length=160)


class LanguageContentSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    content_id: uuid.UUID
    language: LanguageCode
    editorial_status: LanguageEditorialStatus
    translation_status: TranslationStatus
    current_revision_number: int
    live_version_number: int | None
    published_at: datetime | None
    readiness_issues: list[str] = Field(default_factory=list)


class FactCheckDetailResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fact_check: FactCheckSummaryResponse
    languages: list[LanguageContentSummaryResponse]


class DraftPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=0)
    title: str | None = Field(default=None, max_length=500)
    summary: str | None = Field(default=None, max_length=10000)
    claim_text: str | None = None
    context_text: str | None = None
    verdict: PublicVerdict | None = None
    verdict_explanation: str | None = None
    analysis_markdown: str | None = None
    limitations_markdown: str | None = None
    translation_status: TranslationStatus | None = None


class DraftResponse(BaseModel):
    """Staff-facing draft view; excludes investigation internal notes and review comments."""

    model_config = ConfigDict(extra="forbid")

    fact_check_id: uuid.UUID
    language: LanguageCode
    editorial_status: LanguageEditorialStatus
    translation_status: TranslationStatus
    current_revision_number: int
    title: str | None
    summary: str | None
    claim_text: str | None
    context_text: str | None
    verdict: PublicVerdict | None
    verdict_explanation: str | None
    analysis_markdown: str | None
    limitations_markdown: str | None
    sources: list[DraftSourceReferenceResponse]


class DraftSourcesReplaceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[DraftSourceReference] = Field(default_factory=list)


class MarkdownPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    analysis_markdown: str | None = None
    limitations_markdown: str | None = None


class MarkdownPreviewResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    analysis_html: str
    limitations_html: str


class RevisionSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision_number: int
    checksum: str
    created_by_id: uuid.UUID | None
    created_at: datetime


class RevisionListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[RevisionSummaryResponse]


class ReadinessResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    issues: list[str]


class SubmitForReviewResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    editorial_status: LanguageEditorialStatus
    readiness_warnings: list[str]


class ReasonRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(min_length=1, max_length=5000)


class ReviewCommentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    comments: str = Field(min_length=1, max_length=10000)
    field_anchor: str | None = Field(default=None, max_length=200)


class ApproveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=0)


class ReviewResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID
    fact_check_content_id: uuid.UUID
    reviewer_id: uuid.UUID
    decision: ReviewDecision
    comments: str | None
    revision_id: uuid.UUID | None
    created_at: datetime
    invalidated_at: datetime | None


class ApprovalQueueItemResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fact_check_id: uuid.UUID
    language: LanguageCode
    title: str | None = None
    public_slug: str | None = None
    current_revision_number: int
    updated_at: datetime


class ApprovalQueueResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[ApprovalQueueItemResponse]
    next_cursor: str | None


class PublishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    correction_note: str | None = Field(default=None, max_length=10000)


class PublishResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    editorial_status: LanguageEditorialStatus
    version_number: int
    content_checksum: str


class CorrectionStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: ArticleVersionKind
    reason: str = Field(min_length=1, max_length=5000)

    @field_validator("kind")
    @classmethod
    def correction_kind_only(cls, value: ArticleVersionKind) -> ArticleVersionKind:
        allowed = {
            ArticleVersionKind.CORRECTION,
            ArticleVersionKind.UPDATE,
            ArticleVersionKind.CLARIFICATION,
        }
        if value not in allowed:
            raise ValueError("kind must be correction, update, or clarification")
        return value


class WithdrawRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    public_notice: str = Field(min_length=1, max_length=10000)
    internal_reason: str = Field(min_length=1, max_length=5000)


class ReviewListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[ReviewResponse]


class PublishPreviewResponse(BaseModel):
    """What publishing would freeze, built without writing anything."""

    model_config = ConfigDict(extra="forbid")

    snapshot: PublicArticleSnapshot
    kind: ArticleVersionKind
    revision_number: int
    correction_note_required: bool
    readiness_issues: list[str]


class ArticleVersionSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version_number: int
    kind: ArticleVersionKind
    published_at: datetime
    content_checksum: str
    checksum_valid: bool


class ArticleVersionListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[ArticleVersionSummaryResponse]


class ArticleVersionDetailResponse(ArticleVersionSummaryResponse):
    model_config = ConfigDict(extra="forbid")

    snapshot: PublicArticleSnapshot


