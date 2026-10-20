"""Editorial topic management schemas."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field


class TopicCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slug: str = Field(min_length=1, max_length=120)
    name_bo: str = Field(min_length=1, max_length=500)
    name_en: str = Field(min_length=1, max_length=500)
    description_bo: str | None = Field(default=None, max_length=10000)
    description_en: str | None = Field(default=None, max_length=10000)
    position: int = Field(default=0, ge=0)
    is_active: bool = True


class TopicPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slug: str | None = Field(default=None, min_length=1, max_length=120)
    name_bo: str | None = Field(default=None, min_length=1, max_length=500)
    name_en: str | None = Field(default=None, min_length=1, max_length=500)
    description_bo: str | None = Field(default=None, max_length=10000)
    description_en: str | None = Field(default=None, max_length=10000)
    position: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class TopicResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: uuid.UUID
    slug: str
    name_bo: str
    name_en: str
    description_bo: str | None
    description_en: str | None
    position: int
    is_active: bool
    slug_immutable: bool


class TopicListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[TopicResponse]


class FactCheckTopicsReplaceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic_ids: list[uuid.UUID] = Field(default_factory=list, max_length=20)
