"""Database triggers enforce append-only publication and audit rows."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.db.enums import (
    LanguageCode,
    LanguageEditorialStatus,
    ReviewDecision,
    WorkflowStatus,
)
from app.models.publication import (
    FactCheck,
    FactCheckContent,
    FactCheckContentRevision,
    Review,
)
from tests.factories import make_investigation, make_user

pytestmark = pytest.mark.usefixtures("db_session")


async def test_audit_events_reject_update_and_delete(test_engine: AsyncEngine) -> None:
    event_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    async with test_engine.begin() as connection:
        await connection.execute(
            text(
                """
                INSERT INTO users (id, email, email_normalized, is_active, created_at, updated_at)
                VALUES (:id, :email, :email, true, now(), now())
                """
            ),
            {"id": actor_id, "email": f"audit-{event_id.hex[:8]}@example.org"},
        )
        await connection.execute(
            text(
                """
                INSERT INTO audit_events (
                    id, event_type, actor_user_id, subject_type, subject_id, payload, created_at
                ) VALUES (
                    :id, 'test.immutable', :actor_id, 'test', :subject_id, '{}'::jsonb, now()
                )
                """
            ),
            {"id": event_id, "actor_id": actor_id, "subject_id": uuid.uuid4()},
        )

    async with test_engine.begin() as connection:
        with pytest.raises(DBAPIError):
            await connection.execute(
                text("UPDATE audit_events SET event_type = 'tampered' WHERE id = :id"),
                {"id": event_id},
            )

    async with test_engine.begin() as connection:
        with pytest.raises(DBAPIError):
            await connection.execute(
                text("DELETE FROM audit_events WHERE id = :id"),
                {"id": event_id},
            )


async def test_fact_check_content_revisions_reject_update_and_delete(
    db_session: AsyncSession,
) -> None:
    actor = await make_user(db_session)
    investigation = await make_investigation(db_session, owner=actor)
    fact_check = FactCheck(investigation_id=investigation.id, workflow_status=WorkflowStatus.DRAFTING)
    content = FactCheckContent(language=LanguageCode.EN, editorial_status=LanguageEditorialStatus.DRAFT)
    fact_check.contents = [content]
    db_session.add(fact_check)
    await db_session.flush()

    revision = FactCheckContentRevision(
        content_id=content.id,
        revision_number=1,
        fields={"title": "Example"},
        checksum="abc123",
        created_by_id=actor.id,
    )
    db_session.add(revision)
    await db_session.flush()
    revision_id = revision.id

    with pytest.raises(DBAPIError):
        await db_session.execute(
            text("UPDATE fact_check_content_revisions SET checksum = 'nope' WHERE id = :id"),
            {"id": revision_id},
        )

    with pytest.raises(DBAPIError):
        await db_session.execute(
            text("DELETE FROM fact_check_content_revisions WHERE id = :id"),
            {"id": revision_id},
        )


async def test_reviews_reject_updates_other_than_invalidation(
    db_session: AsyncSession,
) -> None:
    actor = await make_user(db_session)
    investigation = await make_investigation(db_session, owner=actor)
    fact_check = FactCheck(investigation_id=investigation.id, workflow_status=WorkflowStatus.DRAFTING)
    content = FactCheckContent(language=LanguageCode.EN, editorial_status=LanguageEditorialStatus.DRAFT)
    fact_check.contents = [content]
    db_session.add(fact_check)
    await db_session.flush()

    review = Review(
        fact_check_content_id=content.id,
        reviewer_id=actor.id,
        decision=ReviewDecision.APPROVE,
    )
    db_session.add(review)
    await db_session.flush()

    with pytest.raises(DBAPIError):
        await db_session.execute(
            text("UPDATE reviews SET comments = 'tampered' WHERE id = :id"),
            {"id": review.id},
        )


async def test_reviews_allow_invalidation_update(db_session: AsyncSession) -> None:
    actor = await make_user(db_session)
    investigation = await make_investigation(db_session, owner=actor)
    fact_check = FactCheck(investigation_id=investigation.id, workflow_status=WorkflowStatus.DRAFTING)
    content = FactCheckContent(language=LanguageCode.EN, editorial_status=LanguageEditorialStatus.DRAFT)
    fact_check.contents = [content]
    db_session.add(fact_check)
    await db_session.flush()

    review = Review(
        fact_check_content_id=content.id,
        reviewer_id=actor.id,
        decision=ReviewDecision.APPROVE,
    )
    db_session.add(review)
    await db_session.flush()

    await db_session.execute(
        text(
            """
            UPDATE reviews
            SET invalidated_at = :invalidated_at, invalidated_reason = :reason
            WHERE id = :id
            """
        ),
        {
            "id": review.id,
            "invalidated_at": datetime.now(UTC),
            "reason": "superseded",
        },
    )
