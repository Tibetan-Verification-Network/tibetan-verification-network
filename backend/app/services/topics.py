"""Staff-managed topics and per fact-check assignments."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.identity import User
from app.models.publication import FactCheck
from app.models.topics import FactCheckTopic, Topic
from app.schemas.topics import (
    FactCheckTopicsReplaceRequest,
    TopicCreateRequest,
    TopicListResponse,
    TopicPatchRequest,
    TopicResponse,
)
from app.services.audit import AuditEventType, record_audit_event


def _topic_response(topic: Topic) -> TopicResponse:
    return TopicResponse.model_validate(topic)


async def list_topics(session: AsyncSession) -> TopicListResponse:
    rows = (
        await session.execute(select(Topic).order_by(Topic.position.asc(), Topic.slug.asc()))
    ).scalars().all()
    return TopicListResponse(items=[_topic_response(row) for row in rows])


async def create_topic(
    session: AsyncSession,
    *,
    actor: User,
    body: TopicCreateRequest,
) -> TopicResponse:
    topic = Topic(
        slug=body.slug.strip(),
        name_bo=body.name_bo.strip(),
        name_en=body.name_en.strip(),
        description_bo=body.description_bo,
        description_en=body.description_en,
        position=body.position,
        is_active=body.is_active,
    )
    session.add(topic)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "slug_conflict", "message": "Topic slug already exists"},
        ) from exc
    await record_audit_event(
        session,
        event_type=AuditEventType.TOPIC_CREATED,
        actor_user_id=actor.id,
        subject_type="topic",
        subject_id=topic.id,
        payload={"slug": topic.slug},
    )
    return _topic_response(topic)


async def patch_topic(
    session: AsyncSession,
    *,
    actor: User,
    topic_id: uuid.UUID,
    body: TopicPatchRequest,
) -> TopicResponse:
    topic = await session.get(Topic, topic_id)
    if topic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    if body.slug is not None and body.slug.strip() != topic.slug:
        if topic.slug_immutable:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "slug_immutable",
                    "message": "Topic slug cannot change after publication",
                },
            )
        topic.slug = body.slug.strip()
    if body.name_bo is not None:
        topic.name_bo = body.name_bo.strip()
    if body.name_en is not None:
        topic.name_en = body.name_en.strip()
    if body.description_bo is not None:
        topic.description_bo = body.description_bo
    if body.description_en is not None:
        topic.description_en = body.description_en
    if body.position is not None:
        topic.position = body.position
    if body.is_active is not None:
        topic.is_active = body.is_active
    try:
        await session.flush()
    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "slug_conflict", "message": "Topic slug already exists"},
        ) from exc
    await record_audit_event(
        session,
        event_type=AuditEventType.TOPIC_UPDATED,
        actor_user_id=actor.id,
        subject_type="topic",
        subject_id=topic.id,
        payload={"slug": topic.slug},
    )
    return _topic_response(topic)


async def replace_fact_check_topics(
    session: AsyncSession,
    *,
    actor: User,
    fact_check: FactCheck,
    body: FactCheckTopicsReplaceRequest,
) -> TopicListResponse:
    unique_ids = list(dict.fromkeys(body.topic_ids))
    if unique_ids:
        found = (
            await session.execute(select(Topic.id).where(Topic.id.in_(unique_ids), Topic.is_active))
        ).scalars().all()
        if len(found) != len(unique_ids):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "invalid_topics", "message": "One or more topics are invalid"},
            )

    await session.execute(
        delete(FactCheckTopic).where(FactCheckTopic.fact_check_id == fact_check.id)
    )
    for topic_id in unique_ids:
        session.add(FactCheckTopic(fact_check_id=fact_check.id, topic_id=topic_id))
    await session.flush()
    await record_audit_event(
        session,
        event_type=AuditEventType.FACTCHECK_TOPICS_UPDATED,
        actor_user_id=actor.id,
        subject_type="fact_check",
        subject_id=fact_check.id,
        payload={"topic_ids": [str(tid) for tid in unique_ids]},
    )
    rows = (
        await session.execute(
            select(Topic)
            .join(FactCheckTopic, FactCheckTopic.topic_id == Topic.id)
            .where(FactCheckTopic.fact_check_id == fact_check.id)
            .order_by(Topic.position.asc(), Topic.slug.asc())
        )
    ).scalars().all()
    return TopicListResponse(items=[_topic_response(row) for row in rows])
