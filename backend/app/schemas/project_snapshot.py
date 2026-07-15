"""Pydantic v2 DTOs for project snapshots (ADR-0014).

ProjectSnapshotMeta is the lightweight list/calendar row (no body); the editor
fetches the heavy ProjectSnapshotRead (dbml_text + layout) only when previewing
or restoring a single snapshot. Both validate straight from the ORM object.
"""
import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProjectSnapshotCreate(BaseModel):
    """Body for POST .../snapshots (manual snapshot)."""

    label: str | None = Field(default=None, max_length=255)


class ProjectSnapshotMeta(BaseModel):
    """Lightweight snapshot row: no dbml_text/layout body."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    kind: str
    label: str | None
    content_hash: str
    created_at: datetime
    # Email of the user this snapshot is attributed to (see model.created_by).
    # None for pre-feature snapshots, never-edited projects, or deleted users.
    # Attached by the route (not an ORM column), like ProjectRead.owner_email.
    created_by_email: str | None = None


class ProjectSnapshotRead(ProjectSnapshotMeta):
    """Full snapshot including the restorable body."""

    dbml_text: str
    layout: dict[str, Any]


class SnapshotCalendarDay(BaseModel):
    """One local calendar date that has snapshots, with a count."""

    date: date
    count: int
