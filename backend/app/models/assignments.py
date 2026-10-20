"""Investigation membership for object-level access control."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.enums import InvestigationAssignmentRole
from app.db.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.db.types import pg_enum

if TYPE_CHECKING:
    from app.models.identity import User
    from app.models.research import Investigation


class InvestigationAssignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "investigation_assignments"

    investigation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("investigations.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    assignment_role: Mapped[InvestigationAssignmentRole] = mapped_column(
        pg_enum(InvestigationAssignmentRole, name="investigation_assignment_role"),
        nullable=False,
    )
    assigned_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    investigation: Mapped[Investigation] = relationship(back_populates="assignments")
    user: Mapped[User] = relationship(foreign_keys=[user_id])
    assigned_by: Mapped[User | None] = relationship(foreign_keys=[assigned_by_id])

    __table_args__ = (
        Index("ix_investigation_assignments_investigation_id", "investigation_id"),
        Index("ix_investigation_assignments_user_id", "user_id"),
        Index(
            "uq_investigation_assignments_active",
            "investigation_id",
            "user_id",
            unique=True,
            postgresql_where=text("removed_at IS NULL"),
        ),
    )
