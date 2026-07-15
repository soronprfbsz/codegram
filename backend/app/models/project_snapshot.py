"""ProjectSnapshot ORM model: an immutable past state of a project (ADR-0014).

A snapshot copies a project's dbml_text + layout at a point in time so the
project can be fully restored to it later. Three kinds:
- "auto_fine":   periodic snapshot of a changed project; pruned after a short
                 retain window.
- "auto_coarse": monthly snapshot of a changed project; kept far longer.
- "manual":      user-created with an optional label; never auto-pruned.

Snapshots are write-once: they have a created_at but no updated_at. layout uses
JSON().with_variant(JSONB, "postgresql") to match the project table (JSON under
sqlite, JSONB under postgres). project_id is an FK to project.id with ON DELETE
CASCADE, so a project's snapshots vanish with it.
"""
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db.base import Base


class ProjectSnapshot(Base):
    """project_snapshot table: a captured past state of one project."""

    __tablename__ = "project_snapshot"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # "auto_fine" | "auto_coarse" | "manual" (see module docstring).
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    # Only manual snapshots carry a label; auto snapshots are anonymous.
    label: Mapped[str | None] = mapped_column(
        String(255), nullable=True, default=None
    )
    dbml_text: Mapped[str] = mapped_column(default="", nullable=False)
    layout: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        default=dict,
        nullable=False,
    )
    # sha256 of dbml_text + canonical(layout); used to skip duplicate auto
    # snapshots (compared per-kind against the latest of the same kind).
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    # The user this snapshot is attributed to, frozen at capture time: the actor
    # for manual/restore snapshots, or the project's last editor for auto
    # snapshots (the scheduler has no logged-in actor). NULL for pre-feature
    # snapshots and never-edited projects. ON DELETE SET NULL: snapshots outlive
    # the users who created them.
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
