"""Fact-check drafts and editorial listing."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps.access import load_fact_check, load_investigation, require_policy_action
from app.core.deps import get_db_session
from app.core.permissions import get_current_user, require_csrf_for_cookie_mutations
from app.core.policy import Action
from app.db.enums import WorkflowStatus
from app.models.publication import FactCheck
from app.models.research import Investigation
from app.schemas.common import LanguageCode
from app.schemas.factchecks import (
    ApproveRequest,
    ArticleVersionDetailResponse,
    ArticleVersionListResponse,
    CorrectionStartRequest,
    DraftPatchRequest,
    DraftResponse,
    DraftSourcesReplaceRequest,
    FactCheckCreateRequest,
    FactCheckCreateResponse,
    FactCheckDetailResponse,
    FactCheckListResponse,
    FactCheckPatchRequest,
    MarkdownPreviewRequest,
    MarkdownPreviewResponse,
    PublishRequest,
    PublishResponse,
    ReadinessResponse,
    ReasonRequest,
    ReviewCommentRequest,
    ReviewResponse,
    RevisionListResponse,
    SubmitForReviewResponse,
    WithdrawRequest,
)
from app.schemas.topics import FactCheckTopicsReplaceRequest, TopicListResponse
from app.services.auth import AuthenticatedUser
from app.services.drafts import (
    create_fact_check,
    get_fact_check_detail,
    get_language_draft,
    list_fact_checks,
    list_language_revisions,
    patch_fact_check,
    patch_language_draft,
    preview_markdown,
    replace_language_sources,
)
from app.services.publication import (
    get_article_version,
    list_article_versions,
    publish_language,
    start_correction,
    withdraw_language,
)
from app.services.reviews import (
    add_review_comment,
    approve_language,
    get_language_readiness,
    mark_ready,
    reopen_language,
    request_changes,
    submit_for_review,
)
from app.services.topics import replace_fact_check_topics

investigation_factcheck_router = APIRouter(tags=["factchecks"])

editorial_factcheck_router = APIRouter(prefix="/editorial/factchecks", tags=["factchecks"])

RequireFactCheckList = Annotated[
    AuthenticatedUser,
    Depends(require_policy_action(Action.FACTCHECK_VIEW)),
]

@investigation_factcheck_router.post(
    "/investigations/{investigation_id}/factcheck",
    response_model=FactCheckCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def factcheck_create(
    body: FactCheckCreateRequest,
    investigation: Annotated[
        Investigation,
        Depends(load_investigation(Action.FACTCHECK_CREATE)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> FactCheckCreateResponse:
    return await create_fact_check(db, investigation=investigation, actor=auth.user, body=body)


@editorial_factcheck_router.get("", response_model=FactCheckListResponse)
async def factcheck_list(
    auth: RequireFactCheckList,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: str | None = None,
    workflow_status: WorkflowStatus | None = None,
    language: LanguageCode | None = None,
    mine: bool = False,
    awaiting_my_approval: bool = False,
) -> FactCheckListResponse:
    return await list_fact_checks(
        db,
        user=auth.user,
        limit=limit,
        cursor=cursor,
        workflow_status=workflow_status,
        language=language,
        mine=mine,
        awaiting_my_approval=awaiting_my_approval,
    )


@editorial_factcheck_router.get("/{fact_check_id}", response_model=FactCheckDetailResponse)
async def factcheck_detail(
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.FACTCHECK_VIEW)),
    ],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> FactCheckDetailResponse:
    return await get_fact_check_detail(db, fact_check=fact_check)


@editorial_factcheck_router.patch("/{fact_check_id}", response_model=FactCheckDetailResponse)
async def factcheck_patch(
    body: FactCheckPatchRequest,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.DRAFT_EDIT)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> FactCheckDetailResponse:
    return await patch_fact_check(db, fact_check=fact_check, actor=auth.user, body=body)


@editorial_factcheck_router.get(
    "/{fact_check_id}/languages/{language}",
    response_model=DraftResponse,
)
async def language_draft_get(
    language: LanguageCode,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.FACTCHECK_VIEW)),
    ],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> DraftResponse:
    return await get_language_draft(db, fact_check=fact_check, language=language)


@editorial_factcheck_router.patch(
    "/{fact_check_id}/languages/{language}",
    response_model=DraftResponse,
)
async def language_draft_patch(
    language: LanguageCode,
    body: DraftPatchRequest,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.DRAFT_EDIT)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> DraftResponse:
    return await patch_language_draft(
        db,
        fact_check=fact_check,
        language=language,
        actor=auth.user,
        body=body,
    )


@editorial_factcheck_router.put(
    "/{fact_check_id}/languages/{language}/sources",
    response_model=DraftResponse,
)
async def language_sources_replace(
    language: LanguageCode,
    body: DraftSourcesReplaceRequest,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.DRAFT_EDIT)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> DraftResponse:
    return await replace_language_sources(
        db,
        fact_check=fact_check,
        language=language,
        actor=auth.user,
        body=body,
    )


@editorial_factcheck_router.post(
    "/{fact_check_id}/languages/{language}/preview",
    response_model=MarkdownPreviewResponse,
)
async def language_markdown_preview(
    language: LanguageCode,
    body: MarkdownPreviewRequest,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.FACTCHECK_VIEW)),
    ],
) -> MarkdownPreviewResponse:
    _ = (language, fact_check)
    return preview_markdown(body)


@editorial_factcheck_router.get(
    "/{fact_check_id}/languages/{language}/readiness",
    response_model=ReadinessResponse,
)
async def language_readiness_get(
    language: LanguageCode,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.FACTCHECK_VIEW)),
    ],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> ReadinessResponse:
    return await get_language_readiness(db, fact_check=fact_check, language=language.value)


@editorial_factcheck_router.post(
    "/{fact_check_id}/languages/{language}/submit-for-review",
    response_model=SubmitForReviewResponse,
)
async def language_submit_for_review(
    language: LanguageCode,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.DRAFT_SUBMIT)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> SubmitForReviewResponse:
    return await submit_for_review(
        db,
        fact_check=fact_check,
        language=language.value,
        actor=auth.user,
    )


@editorial_factcheck_router.post(
    "/{fact_check_id}/languages/{language}/reviews",
    response_model=ReviewResponse,
)
async def language_review_comment(
    language: LanguageCode,
    body: ReviewCommentRequest,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.REVIEW_COMMENT)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> ReviewResponse:
    return await add_review_comment(
        db,
        fact_check=fact_check,
        language=language.value,
        actor=auth.user,
        body=body,
    )


@editorial_factcheck_router.post(
    "/{fact_check_id}/languages/{language}/request-changes",
    response_model=DraftResponse,
)
async def language_request_changes(
    language: LanguageCode,
    body: ReasonRequest,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.REVIEW_REQUEST_CHANGES)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> DraftResponse:
    return await request_changes(
        db,
        fact_check=fact_check,
        language=language.value,
        actor=auth.user,
        body=body,
    )


@editorial_factcheck_router.post(
    "/{fact_check_id}/languages/{language}/mark-ready",
    response_model=DraftResponse,
)
async def language_mark_ready(
    language: LanguageCode,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.REVIEW_MARK_READY)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> DraftResponse:
    return await mark_ready(
        db,
        fact_check=fact_check,
        language=language.value,
        actor=auth.user,
    )


@editorial_factcheck_router.post(
    "/{fact_check_id}/languages/{language}/approve",
    response_model=DraftResponse,
)
async def language_approve(
    language: LanguageCode,
    body: ApproveRequest,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.APPROVE)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> DraftResponse:
    return await approve_language(
        db,
        fact_check=fact_check,
        language=language.value,
        actor=auth.user,
        body=body,
    )


@editorial_factcheck_router.post(
    "/{fact_check_id}/languages/{language}/reopen",
    response_model=DraftResponse,
)
async def language_reopen(
    language: LanguageCode,
    body: ReasonRequest,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.DRAFT_EDIT)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> DraftResponse:
    return await reopen_language(
        db,
        fact_check=fact_check,
        language=language.value,
        actor=auth.user,
        body=body,
    )


@editorial_factcheck_router.get(
    "/{fact_check_id}/languages/{language}/revisions",
    response_model=RevisionListResponse,
)
async def language_revisions_list(
    language: LanguageCode,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.FACTCHECK_VIEW)),
    ],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> RevisionListResponse:
    return await list_language_revisions(db, fact_check=fact_check, language=language)


@editorial_factcheck_router.post(
    "/{fact_check_id}/languages/{language}/publish",
    response_model=PublishResponse,
)
async def language_publish(
    language: LanguageCode,
    body: PublishRequest,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.PUBLISH)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> PublishResponse:
    return await publish_language(
        db,
        fact_check=fact_check,
        language=language.value,
        actor=auth.user,
        body=body,
    )


@editorial_factcheck_router.post(
    "/{fact_check_id}/languages/{language}/corrections",
    response_model=DraftResponse,
)
async def language_correction_start(
    language: LanguageCode,
    body: CorrectionStartRequest,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.CORRECTION_START)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> DraftResponse:
    return await start_correction(
        db,
        fact_check=fact_check,
        language=language.value,
        actor=auth.user,
        body=body,
    )


@editorial_factcheck_router.post(
    "/{fact_check_id}/languages/{language}/withdraw",
    response_model=DraftResponse,
)
async def language_withdraw(
    language: LanguageCode,
    body: WithdrawRequest,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.WITHDRAW)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> DraftResponse:
    return await withdraw_language(
        db,
        fact_check=fact_check,
        language=language.value,
        actor=auth.user,
        body=body,
    )


@editorial_factcheck_router.get(
    "/{fact_check_id}/languages/{language}/versions",
    response_model=ArticleVersionListResponse,
)
async def language_versions_list(
    language: LanguageCode,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.FACTCHECK_VIEW)),
    ],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> ArticleVersionListResponse:
    return await list_article_versions(db, fact_check=fact_check, language=language.value)


@editorial_factcheck_router.get(
    "/{fact_check_id}/languages/{language}/versions/{version_number}",
    response_model=ArticleVersionDetailResponse,
)
async def language_version_get(
    language: LanguageCode,
    version_number: int,
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.FACTCHECK_VIEW)),
    ],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> ArticleVersionDetailResponse:
    return await get_article_version(
        db,
        fact_check=fact_check,
        language=language.value,
        version_number=version_number,
    )


@editorial_factcheck_router.put(
    "/{fact_check_id}/topics",
    response_model=TopicListResponse,
)
async def fact_check_topics_replace(
    fact_check: Annotated[
        FactCheck,
        Depends(load_fact_check(Action.FACTCHECK_TOPICS_EDIT)),
    ],
    auth: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: FactCheckTopicsReplaceRequest,
    _: Annotated[None, Depends(require_csrf_for_cookie_mutations)],
) -> TopicListResponse:
    return await replace_fact_check_topics(db, actor=auth.user, fact_check=fact_check, body=body)
