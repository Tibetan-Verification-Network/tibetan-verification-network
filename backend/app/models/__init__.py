"""ORM models registered for Alembic metadata discovery."""

from app.models.archive import AccessGrant, ArchiveDocument
from app.models.audit import AuditEvent
from app.models.identity import AuthSession, Role, StaffInvite, StaffInviteRole, User, UserRole
from app.models.intake import Claim, Submission, SubmissionContact
from app.models.publication import ArticleVersion, FactCheck, FactCheckContent, Review
from app.models.research import EvidenceItem, Investigation, ResearchRun, Source

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
    "Investigation",
    "ResearchRun",
    "Review",
    "Role",
    "Source",
    "StaffInvite",
    "StaffInviteRole",
    "Submission",
    "SubmissionContact",
    "User",
    "UserRole",
]
