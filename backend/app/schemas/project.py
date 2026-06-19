"""Pydantic v2 DTOs for projects: create, read, and partial update.

ProjectUpdate carries all-optional fields so the same PATCH endpoint serves
both manual edits and debounced autosave (a body may set only dbml_text).
ProjectRead uses from_attributes=True to validate straight from the ORM object
and exposes only safe fields (no hashed/user-internal data).
"""
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    """Body for POST /api/projects."""

    name: str = Field(min_length=1, max_length=255)
    dbml_text: str = Field(default="")
    layout: dict[str, Any] = Field(default_factory=dict)


class ProjectUpdate(BaseModel):
    """Body for PATCH /api/projects/{id} (manual edits + autosave).

    All fields are optional; only fields actually present in the request are
    applied (the service skips None values).
    """

    name: str | None = Field(default=None, min_length=1, max_length=255)
    dbml_text: str | None = Field(default=None)
    layout: dict[str, Any] | None = Field(default=None)
    glyph: str | None = Field(default=None, max_length=8)
    color: str | None = Field(default=None, max_length=16)


class ProjectRead(BaseModel):
    """Response DTO for a project; validates from the ORM object."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    dbml_text: str
    glyph: str | None
    color: str | None
    layout: dict[str, Any]
    created_at: datetime
    updated_at: datetime
