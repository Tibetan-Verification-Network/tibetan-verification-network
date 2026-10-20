"""Staff-facing audit event listing schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditEventResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID
    event_type: str
    actor_user_id: uuid.UUID | None
    subject_type: str | None
    subject_id: uuid.UUID | None
    payload: dict[str, object] | None
    created_at: datetime


class AuditEventListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[AuditEventResponse]
    next_cursor: str | None
