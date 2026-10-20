"""Allow-listed schemas for anonymous public read APIs."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.db.enums import ArticleVersionKind, PublicVerdict
from app.schemas.factchecks import PublicArticleSnapshot


class PublicFactCheckCard(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slug: str
    language: str
    title: str
    summary: str | None
    verdict: PublicVerdict
    topics: list[str]
    first_published_at: datetime
    last_published_at: datetime


class PublicFactCheckListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[PublicFactCheckCard]
    next_cursor: str | None = None


class TranslationLinkState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: str
    status: Literal["published", "pending", "unavailable"]
    slug: str | None = None


class PublicVersionSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version_number: int
    kind: ArticleVersionKind
    published_at: datetime
    correction_note: str | None = None


class PublicFactCheckDetailResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    snapshot: PublicArticleSnapshot
    checksum: str
    translations: list[TranslationLinkState]
    versions: list[PublicVersionSummary]


class PublicTopicSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slug: str
    name_bo: str
    name_en: str
    description_bo: str | None = None
    description_en: str | None = None
    published_count_en: int = 0
    published_count_bo: int = 0


class PublicTopicListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[PublicTopicSummary]


class PublicTopicDetailResponse(PublicTopicSummary):
    model_config = ConfigDict(extra="forbid")

    recent: list[PublicFactCheckCard] = Field(default_factory=list)
