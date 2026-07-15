"""Project snapshot routes: history list, calendar, preview, restore (ADR-0014).

Mounted under /api/projects/{project_id}/snapshots. Every endpoint authenticates
via require_password_ok and delegates to ProjectSnapshotService, which enforces
parent-project ownership (missing/not-owned -> 404). The router maps domain
exceptions to HTTP status codes (404 for missing, 409 for business-rule
conflicts) and never touches the ORM/session directly.
"""
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_password_ok
from app.db.session import get_session
from app.models.user import User
from app.schemas.project import ProjectRead
from app.schemas.project_snapshot import (
    ProjectSnapshotCreate,
    ProjectSnapshotMeta,
    ProjectSnapshotRead,
    SnapshotCalendarDay,
)
from app.services.lock_guard import EditLockConflictError
from app.services.project import (
    ProjectForbiddenError,
    ProjectNotFoundError,
    StaleVersionError,
)
from app.services.project_snapshot import (
    ProjectSnapshotNotFoundError,
    ProjectSnapshotService,
    SnapshotLimitError,
    SnapshotNotDeletableError,
)

router = APIRouter(
    prefix="/projects/{project_id}/snapshots", tags=["snapshots"]
)

_PROJECT_NOT_FOUND = "Project not found"
_SNAPSHOT_NOT_FOUND = "Snapshot not found"


def _forbidden() -> HTTPException:
    """403 — the caller has a role but lacks this snapshot capability."""
    return HTTPException(status.HTTP_403_FORBIDDEN, detail="Forbidden")


def get_snapshot_service(
    session: AsyncSession = Depends(get_session),
) -> ProjectSnapshotService:
    """Provide a ProjectSnapshotService bound to the request-scoped session."""
    return ProjectSnapshotService(session)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=ProjectSnapshotRead,
)
async def create_snapshot(
    project_id: uuid.UUID,
    payload: ProjectSnapshotCreate,
    user: User = Depends(require_password_ok),
    service: ProjectSnapshotService = Depends(get_snapshot_service),
) -> ProjectSnapshotRead:
    """Create a manual snapshot of the project's current state."""
    try:
        snapshot = await service.create_manual(
            project_id, user.id, label=payload.label
        )
    except ProjectForbiddenError:
        raise _forbidden() from None
    except ProjectNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=_PROJECT_NOT_FOUND
        ) from None
    except SnapshotLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Manual snapshot limit reached (max {exc.args[0]})",
        ) from None
    # A manual snapshot is authored by the acting user (== snapshot.created_by).
    return ProjectSnapshotRead.model_validate(snapshot).model_copy(
        update={"created_by_email": user.email}
    )


@router.get("", response_model=list[ProjectSnapshotMeta])
async def list_snapshots(
    project_id: uuid.UUID,
    group: Literal["auto", "manual"] | None = None,
    day: date | None = Query(default=None, alias="date"),
    tz_offset: int = Query(default=0, ge=-1440, le=1440),
    user: User = Depends(require_password_ok),
    service: ProjectSnapshotService = Depends(get_snapshot_service),
) -> list[ProjectSnapshotMeta]:
    """List snapshot metadata (no body); optionally one local day / group."""
    try:
        snapshots = await service.list_snapshots(
            project_id,
            user.id,
            group=group,
            day=day,
            tz_offset_minutes=tz_offset,
        )
    except ProjectForbiddenError:
        raise _forbidden() from None
    except ProjectNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=_PROJECT_NOT_FOUND
        ) from None
    return [
        ProjectSnapshotMeta.model_validate(s).model_copy(
            update={"created_by_email": email}
        )
        for s, email in snapshots
    ]


@router.get("/calendar", response_model=list[SnapshotCalendarDay])
async def snapshot_calendar(
    project_id: uuid.UUID,
    month: str = Query(description="Local month as YYYY-MM"),
    group: Literal["auto", "manual"] | None = None,
    tz_offset: int = Query(default=0, ge=-1440, le=1440),
    user: User = Depends(require_password_ok),
    service: ProjectSnapshotService = Depends(get_snapshot_service),
) -> list[SnapshotCalendarDay]:
    """Return local dates with snapshots (and counts) for a local month."""
    year, parsed_month = _parse_month(month)
    try:
        counts = await service.calendar(
            project_id,
            user.id,
            year=year,
            month=parsed_month,
            group=group,
            tz_offset_minutes=tz_offset,
        )
    except ProjectForbiddenError:
        raise _forbidden() from None
    except ProjectNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=_PROJECT_NOT_FOUND
        ) from None
    return [
        SnapshotCalendarDay(date=day, count=count)
        for day, count in sorted(counts.items())
    ]


@router.get("/{snapshot_id}", response_model=ProjectSnapshotRead)
async def get_snapshot(
    project_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    user: User = Depends(require_password_ok),
    service: ProjectSnapshotService = Depends(get_snapshot_service),
) -> ProjectSnapshotRead:
    """Get one snapshot with its full restorable body (for preview)."""
    try:
        snapshot, email = await service.get_snapshot(
            project_id, snapshot_id, user.id
        )
    except ProjectForbiddenError:
        raise _forbidden() from None
    except (ProjectNotFoundError, ProjectSnapshotNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=_SNAPSHOT_NOT_FOUND
        ) from None
    return ProjectSnapshotRead.model_validate(snapshot).model_copy(
        update={"created_by_email": email}
    )


@router.delete("/{snapshot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_snapshot(
    project_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    user: User = Depends(require_password_ok),
    service: ProjectSnapshotService = Depends(get_snapshot_service),
) -> None:
    """Delete a manual snapshot (auto snapshots are not user-deletable)."""
    try:
        await service.delete_manual(project_id, snapshot_id, user.id)
    except ProjectForbiddenError:
        raise _forbidden() from None
    except (ProjectNotFoundError, ProjectSnapshotNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=_SNAPSHOT_NOT_FOUND
        ) from None
    except SnapshotNotDeletableError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only manual snapshots can be deleted",
        ) from None


@router.post("/{snapshot_id}/restore", response_model=ProjectRead)
async def restore_snapshot(
    project_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    user: User = Depends(require_password_ok),
    service: ProjectSnapshotService = Depends(get_snapshot_service),
) -> ProjectRead:
    """Restore the project to a snapshot (after a safety snapshot of current)."""
    try:
        project = await service.restore(project_id, snapshot_id, user.id)
    except ProjectForbiddenError:
        raise _forbidden() from None
    except (ProjectNotFoundError, ProjectSnapshotNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=_SNAPSHOT_NOT_FOUND
        ) from None
    except EditLockConflictError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"reason": "edit_locked", "locked_by_email": exc.locked_by_email},
        ) from None
    except StaleVersionError:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail={"reason": "stale_version"}
        ) from None
    return ProjectRead.model_validate(project)


def _parse_month(month: str) -> tuple[int, int]:
    """Parse 'YYYY-MM' into (year, month) or raise HTTP 400."""
    try:
        year_str, month_str = month.split("-")
        year, parsed = int(year_str), int(month_str)
        if not (1 <= parsed <= 12 and 1 <= year <= 9999):
            raise ValueError
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="month must be formatted as YYYY-MM",
        ) from None
    return year, parsed
