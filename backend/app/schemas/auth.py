"""Authentication request and response models."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.db.enums import RoleCode


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class ActivateInviteRequest(BaseModel):
    token: str = Field(min_length=16, max_length=512)
    password: str = Field(min_length=1, max_length=256)
    display_name: str | None = Field(default=None, max_length=200)


class AuthSessionResponse(BaseModel):
    csrf_token: str


class CurrentUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str | None
    roles: list[RoleCode]
    is_active: bool


class CsrfResponse(BaseModel):
    csrf_token: str


class CreateInviteRequest(BaseModel):
    email: EmailStr
    role_codes: list[RoleCode] = Field(min_length=1)
    display_name: str | None = Field(default=None, max_length=200)

    @field_validator("role_codes")
    @classmethod
    def dedupe_roles(cls, value: list[RoleCode]) -> list[RoleCode]:
        seen: list[RoleCode] = []
        for code in value:
            if code not in seen:
                seen.append(code)
        return seen


class CreateInviteResponse(BaseModel):
    invite_id: uuid.UUID
    email: str
    expires_at: datetime
    token: str


class UpdateUserRolesRequest(BaseModel):
    role_codes: list[RoleCode] = Field(min_length=1)

    @field_validator("role_codes")
    @classmethod
    def dedupe_roles(cls, value: list[RoleCode]) -> list[RoleCode]:
        seen: list[RoleCode] = []
        for code in value:
            if code not in seen:
                seen.append(code)
        return seen


class UserSummaryResponse(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str | None
    roles: list[RoleCode]
    is_active: bool
    disabled_at: datetime | None


class EditorialStatusResponse(BaseModel):
    status: str
    roles: list[RoleCode]
