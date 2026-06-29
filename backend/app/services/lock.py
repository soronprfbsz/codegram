"""Edit-lock business logic: the single-editor lease (ADR-0015).

One editor at a time holds a project's edit lock. Acquire/heartbeat extend a TTL;
the lock auto-expires so a crashed/closed session frees it. Force takeover is
owner-only. Authorization reuses ProjectService (resolve_role/get_authorized).
The acquire/write conflict primitive lives in lock_guard (cycle-free).
"""
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.lock import LockRepository
from app.repositories.user import UserRepository
from app.services.access import Capability
from app.services.lock_guard import (
    LOCK_TTL_SECONDS,
    aware,
    now_utc,
    take_or_conflict,
)
from app.services.project import ProjectService


@dataclass(frozen=True)
class LockState:
    """Resolved lock view for a project from the caller's perspective."""

    locked: bool
    locked_by: uuid.UUID | None
    locked_by_email: str | None
    expires_at: datetime | None
    is_me: bool


class LockService:
    """Acquire / renew / release / force / inspect the project edit lock."""

    def __init__(self, session: AsyncSession) -> None:
        """Build over the request-scoped session + lock/user repos + authz."""
        self.locks = LockRepository(session)
        self.users = UserRepository(session)
        self.projects = ProjectService(session)

    async def _email_of(self, user_id: uuid.UUID) -> str | None:
        user = await self.users.get_by_id(user_id)
        return user.email if user is not None else None

    async def _state(self, lock, viewer_id: uuid.UUID) -> LockState:
        """Build a LockState from a lock row (None / expired => unlocked)."""
        if lock is None or aware(lock.expires_at) <= now_utc():
            return LockState(False, None, None, None, False)
        return LockState(
            locked=True,
            locked_by=lock.locked_by,
            locked_by_email=await self._email_of(lock.locked_by),
            expires_at=aware(lock.expires_at),
            is_me=lock.locked_by == viewer_id,
        )

    async def status(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> LockState:
        """Return the current lock state (any participant; requires VIEW)."""
        await self.projects.get_authorized(project_id, user_id, Capability.VIEW)
        return await self._state(await self.locks.get(project_id), user_id)

    async def acquire(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> LockState:
        """Acquire or renew the lock (requires EDIT); 409 if held by another."""
        await self.projects.get_authorized(project_id, user_id, Capability.EDIT)
        await take_or_conflict(self.locks, self.users, project_id, user_id)
        return await self._state(await self.locks.get(project_id), user_id)

    async def force(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> LockState:
        """Owner force-takeover of a live lock (requires FORCE_LOCK)."""
        await self.projects.get_authorized(
            project_id, user_id, Capability.FORCE_LOCK
        )
        await self.locks.upsert(
            project_id, user_id, now_utc() + timedelta(seconds=LOCK_TTL_SECONDS)
        )
        return await self._state(await self.locks.get(project_id), user_id)

    async def release(self, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        """Release the lock if the caller holds it (requires EDIT)."""
        await self.projects.get_authorized(project_id, user_id, Capability.EDIT)
        lock = await self.locks.get(project_id)
        if lock is not None and lock.locked_by == user_id:
            await self.locks.delete(project_id)
