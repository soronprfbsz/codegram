"""Edit-lock primitives shared by LockService and the project write path.

Kept free of any ProjectService import so both can depend on it without a cycle
(LockService imports ProjectService for authz; ProjectService imports only these
primitives for its content-write guard).
"""
import uuid
from datetime import datetime, timedelta, timezone

from app.repositories.lock import LockRepository
from app.repositories.user import UserRepository

#: Lock validity without a heartbeat/write (visibility-gated client, ADR-0015).
LOCK_TTL_SECONDS = 60


def now_utc() -> datetime:
    """Current UTC instant (aware)."""
    return datetime.now(timezone.utc)


def aware(dt: datetime) -> datetime:
    """Coerce a possibly-naive timestamp (sqlite loses tz on round-trip) to UTC."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


class EditLockConflictError(Exception):
    """Another user holds a live edit lock (-> 409). Carries holder info."""

    def __init__(
        self,
        locked_by: uuid.UUID,
        locked_by_email: str | None,
        expires_at: datetime,
    ) -> None:
        super().__init__(locked_by)
        self.locked_by = locked_by
        self.locked_by_email = locked_by_email
        self.expires_at = expires_at


async def take_or_conflict(
    locks: LockRepository,
    users: UserRepository,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    """Auto-acquire a free/own/expired lock for user_id; raise
    EditLockConflictError when another user holds it live."""
    lock = await locks.get(project_id)
    if (
        lock is not None
        and lock.locked_by != user_id
        and aware(lock.expires_at) > now_utc()
    ):
        holder = await users.get_by_id(lock.locked_by)
        raise EditLockConflictError(
            lock.locked_by,
            holder.email if holder is not None else None,
            aware(lock.expires_at),
        )
    await locks.upsert(
        project_id, user_id, now_utc() + timedelta(seconds=LOCK_TTL_SECONDS)
    )
