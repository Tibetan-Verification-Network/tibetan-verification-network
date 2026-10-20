"""ORM models registered for Alembic metadata discovery."""

from app.models.archive import AccessGrant, ArchiveDocument
from app.models.assignments import InvestigationAssignment
from app.models.audit import AuditEvent
from app.models.identity import AuthSession, Role, StaffInvite, StaffInviteRole, User, UserRole
from app.models.intake import Claim, Submission, SubmissionContact
from app.models.public_index import PublicArticle
from app.models.publication import (
    ArticleVersion,
    FactCheck,
    FactCheckContent,
    FactCheckContentRevision,
    FactCheckContentSource,
    Review,
)
from app.models.rate_limit import RateLimitCounter
from app.models.research import EvidenceItem, Investigation, ResearchRun, Source
from app.models.topics import FactCheckTopic, Topic

__all__ = [
    "AccessGrant",
    "ArchiveDocument",
    "ArticleVersion",
    "AuditEvent",
    "AuthSession",
    "Claim",
    "EvidenceItem",
    "FactCheck",
    "FactCheckContent",
    "FactCheckContentRevision",
    "FactCheckContentSource",
    "FactCheckTopic",
    "Investigation",
    "InvestigationAssignment",
    "PublicArticle",
    "RateLimitCounter",
    "ResearchRun",
    "Review",
    "Role",
    "Source",
    "StaffInvite",
    "StaffInviteRole",
    "Submission",
    "SubmissionContact",
    "Topic",
    "User",
    "UserRole",
]
