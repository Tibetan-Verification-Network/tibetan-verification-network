"""Public status payloads. These models contain no configuration."""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class LivenessResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"]


class ReadinessResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ready", "not_ready"]


class ServiceInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    version: str
