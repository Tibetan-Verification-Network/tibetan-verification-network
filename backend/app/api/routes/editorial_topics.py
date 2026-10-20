"""Editorial topic management."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.access import load_fact_check, require_policy_action
from app.core.deps import get_db_session
from app.core.permissions import require_csrf_for_cookie_mutations
from app.core.policy import Action
from app.models.publication import FactCheck
from app.schemas.topics import (
    TopicCreateRequest,
    TopicListResponse,
    TopicPatchRequest,
    TopicResponse,
)
from app.services.auth import AuthenticatedUser
from app.services.topics import create_topic, list_topics, patch_topic

router = APIRouter(prefix="/topics", tags=["editorial"])

RequireTopicManage = Annotated[
    AuthenticatedUser,
    Depends(require_policy_action(Action.TOPIC_MANAGE)),
]

RequireFactCheckTopicsEdit = Annotated[
    FactCheck,
    Depends(load_fact_check(Action.FACTCHECK_TOPICS_EDIT)),
]


@router.get("", response_model=TopicListResponse)
async def editorial_topics_list(
    auth: RequireTopicManage,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> TopicListResponse:
    del auth
    return await list_topics(db)


@router.post("", response_model=TopicResponse, status_code=status.HTTP_201_CREATED)
async def editorial_topics_create(
    auth: RequireTopicManage,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: TopicCreateRequest,
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> TopicResponse:
    return await create_topic(db, actor=auth.user, body=body)


@router.patch("/{topic_id}", response_model=TopicResponse)
async def editorial_topics_patch(
    topic_id: uuid.UUID,
    auth: RequireTopicManage,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: TopicPatchRequest,
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> TopicResponse:
    return await patch_topic(db, actor=auth.user, topic_id=topic_id, body=body)
