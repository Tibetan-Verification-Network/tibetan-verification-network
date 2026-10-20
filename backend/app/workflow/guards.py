"""Pure independence and authorship checks for editorial workflow."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.identity import User
from app.models.publication import FactCheckContent, FactCheckContentRevision


async def authors_of(session: AsyncSession, content: FactCheckContent) -> set[uuid.UUID]:
    """Return user ids who saved a material revision in the current publication cycle."""
    stmt = (
        select(FactCheckContentRevision.created_by_id)
        .where(FactCheckContentRevision.content_id == content.id)
        .distinct()
    )
    if content.cycle_started_at is not None:
        stmt = stmt.where(FactCheckContentRevision.created_at >= content.cycle_started_at)
    result = await session.execute(stmt)
    return {row[0] for row in result if row[0] is not None}


def assert_not_author(
    actor: User,
    author_ids: set[uuid.UUID],
    *,
    message: str = "Authors may not perform this action on their own draft",
) -> None:
    from app.workflow.exceptions import GuardCode, TransitionBlockedError

    if actor.id in author_ids:
        raise TransitionBlockedError(code=GuardCode.IS_AUTHOR.value, message=message)


def assert_is_approving_reviewer(
    actor: User,
    *,
    approving_reviewer_id: uuid.UUID | None,
    message: str = "Only the recorded approver may perform this action",
) -> None:
    from app.workflow.exceptions import GuardCode, TransitionBlockedError

    if approving_reviewer_id is None or actor.id != approving_reviewer_id:
        raise TransitionBlockedError(
            code=GuardCode.NOT_APPROVING_REVIEWER.value,
            message=message,
        )


def assert_not_ready_marking_editor(
    actor: User,
    *,
    ready_marking_editor_id: uuid.UUID | None,
    message: str = "The editor who marked this version ready may not approve it",
) -> None:
    from app.workflow.exceptions import GuardCode, TransitionBlockedError

    if ready_marking_editor_id is not None and actor.id == ready_marking_editor_id:
        raise TransitionBlockedError(
            code=GuardCode.IS_READY_MARKING_EDITOR.value,
            message=message,
        )
