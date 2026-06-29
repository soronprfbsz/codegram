"""ProjectEditLock ORM model: the volatile single-editor lease for a project.

Async shared editing (ADR-0015) allows one editor at a time. This table holds
at most one row per project (project_id is the PK): who currently holds the
edit lease and when it expires. It is NOT project content — it is never
snapshotted and must not touch Project.updated_at, which is why it lives in its
own table. Acquire/takeover = upsert the row when absent or expired; heartbeat =
extend expires_at. Both FKs cascade so the lock vanishes with the project or
the holding user.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProjectEditLock(Base):
    """project_edit_lock table: 0..1 active edit lease per project."""

    __tablename__ = "project_edit_lock"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("project.id", ondelete="CASCADE"),
        primary_key=True,
    )
    locked_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
