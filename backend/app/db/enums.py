"""PostgreSQL-backed domain enumerations for the core schema."""

from enum import StrEnum


class RoleCode(StrEnum):
    PLATFORM_ADMINISTRATOR = "platform_administrator"
    RESEARCHER = "researcher"
    EDITOR = "editor"
    APPROVER = "approver"


class WorkflowStatus(StrEnum):
    INBOX = "inbox"
    TRIAGED = "triaged"
    RESEARCHING = "researching"
    DRAFTING = "drafting"
    IN_REVIEW = "in_review"
    CHANGES_REQUESTED = "changes_requested"
    APPROVED = "approved"
    PUBLISHED = "published"
    REJECTED = "rejected"
    ON_HOLD = "on_hold"


class LanguageCode(StrEnum):
    BO = "bo"
    EN = "en"


class PublicVerdict(StrEnum):
    TRUE = "true"
    FALSE = "false"
    MISLEADING = "misleading"
    UNVERIFIED = "unverified"
    UNCLEAR = "unclear"


class LanguageEditorialStatus(StrEnum):
    DRAFT = "draft"
    IN_REVIEW = "in_review"
    CHANGES_REQUESTED = "changes_requested"
    APPROVED = "approved"
    PUBLISHED = "published"


class TranslationStatus(StrEnum):
    PENDING = "pending"
    IN_REVIEW = "in_review"
    PUBLISHED = "published"
    UNAVAILABLE = "unavailable"


class EvidenceStance(StrEnum):
    SUPPORTS = "supports"
    CONTRADICTS = "contradicts"
    CONTEXTUALIZES = "contextualizes"


class ArchiveVisibility(StrEnum):
    PUBLIC_METADATA = "public_metadata"
    PUBLIC_DOCUMENT = "public_document"
    INTERNAL = "internal"
    RESTRICTED = "restricted"


class ReviewDecision(StrEnum):
    COMMENT = "comment"
    REQUEST_CHANGES = "request_changes"
    APPROVE = "approve"


class ResearchRunStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class SubmissionChannel(StrEnum):
    PUBLIC_FORM = "public_form"
    EDITORIAL = "editorial"
    MONITORING = "monitoring"


class InvestigationAssignmentRole(StrEnum):
    OWNER = "owner"
    CONTRIBUTOR = "contributor"


class ArchiveUploadStatus(StrEnum):
    PENDING = "pending"
    AVAILABLE = "available"
    REJECTED = "rejected"
