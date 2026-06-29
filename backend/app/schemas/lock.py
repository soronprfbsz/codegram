"""Pydantic v2 DTOs for the project edit lock (single-editor lease)."""
import uuid
from datetime import datetime

from pydantic import BaseModel


class LockStatus(BaseModel):
    """Current edit-lock state of a project, from the caller's perspective."""

    locked: bool
    locked_by: uuid.UUID | None = None
    locked_by_email: str | None = None
    expires_at: datetime | None = None
    #: True when the live lock is held by the caller.
    is_me: bool = False
