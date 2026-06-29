"""Project ORM model: a per-user DBML document with autosave layout.

The layout column uses JSON().with_variant(JSONB, "postgresql") so the same
model builds a JSON column under sqlite (the in-memory test DB) and a JSONB
column under postgres (prod + alembic autogenerate). user_id is a foreign key
to the fastapi-users "user" table with ON DELETE CASCADE.
"""
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db.base import Base


class Project(Base):
    """Project table: a DBML document owned by a single user.

    Columns:
    - id: UUID primary key (default uuid4, consistent with User.id).
    - user_id: UUID FK -> user.id with ON DELETE CASCADE (indexed).
    - name: required project name.
    - dbml_text: required DBML source text (default "").
    - layout: JSONB on postgres / JSON on sqlite, required (default {}).
    - created_at / updated_at: timezone-aware timestamps (DateTime(timezone=True))
      with both a Python-side default and a server_default. updated_at refreshes
      via a Python-side onupdate (datetime.now(timezone.utc)) on every UPDATE.
      A Python-side onupdate (NOT server-side func.now()) is required: a
      server-side onupdate expires updated_at after a flush, and the route's
      synchronous ProjectRead.model_validate(project) would then re-read it,
      raising MissingGreenlet under async SQLAlchemy.
    """

    __tablename__ = "project"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(nullable=False)
    dbml_text: Mapped[str] = mapped_column(default="", nullable=False)
    glyph: Mapped[str | None] = mapped_column(
        String(8), nullable=True, default=None
    )
    color: Mapped[str | None] = mapped_column(
        String(16), nullable=True, default=None
    )
    # 배경색(아이콘/글씨색은 `color`). null이면 프런트가 color 틴트로 폴백.
    bg_color: Mapped[str | None] = mapped_column(
        String(16), nullable=True, default=None
    )
    layout: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"),
        default=dict,
        nullable=False,
    )
    # Optimistic-concurrency counter: bumped on every content write (dbml_text /
    # layout). Stale writes (version mismatch) are rejected — the backstop behind
    # the pessimistic edit lock (ADR-0015).
    version: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default=text("0"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
