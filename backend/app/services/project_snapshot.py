"""Project snapshot business logic: history capture, restore, prune (ADR-0014).

Every operation authorizes against the parent project's role (ADR-0015) via
ProjectService.get_authorized with the matching capability: read history = VIEW
(any participant), create = CREATE_SNAPSHOT (owner/editor), delete =
DELETE_SNAPSHOT (owner), restore = EDIT (owner/editor, and a content write so it
also takes the edit lock). No role -> ProjectNotFoundError (404); role but not
the capability -> ProjectForbiddenError (403). The service does not commit; the
request scope (get_session) or the scheduler job commits the unit of work.

Snapshot kinds and dedup: auto snapshots are skipped when the project's current
content hash equals the latest snapshot OF THE SAME KIND (per-kind comparison,
so a quiet month still keeps a coarse representative even after fine snapshots
are pruned). Manual snapshots are always stored (never deduped), carry a label,
are capped per project, and are exempt from auto-prune.
"""
import hashlib
import json
import uuid
from collections.abc import Sequence
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.project import Project
from app.models.project_snapshot import ProjectSnapshot
from app.repositories.project_snapshot import ProjectSnapshotRepository
from app.services.access import Capability
from app.services.project import ProjectService

KIND_FINE = "auto_fine"
KIND_COARSE = "auto_coarse"
KIND_MANUAL = "manual"
AUTO_KINDS = (KIND_FINE, KIND_COARSE)

SnapshotGroup = Literal["auto", "manual"]


def compute_content_hash(dbml_text: str, layout: dict[str, Any]) -> str:
    """sha256 over dbml_text + canonical(layout); stable across equal content."""
    canonical_layout = json.dumps(
        layout, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    digest = hashlib.sha256()
    digest.update(dbml_text.encode("utf-8"))
    digest.update(b"\x00")
    digest.update(canonical_layout.encode("utf-8"))
    return digest.hexdigest()


def _kinds_for_group(group: SnapshotGroup | None) -> Sequence[str] | None:
    """Map a UI group ('auto'/'manual') to the concrete kinds it spans."""
    if group == "auto":
        return AUTO_KINDS
    if group == "manual":
        return (KIND_MANUAL,)
    return None


class ProjectSnapshotNotFoundError(Exception):
    """A snapshot is missing or not under the requesting user's project."""


class SnapshotLimitError(Exception):
    """The per-project manual snapshot cap has been reached."""


class SnapshotNotDeletableError(Exception):
    """An auto snapshot was targeted for deletion (only manual is deletable)."""


class ProjectSnapshotService:
    """High-level snapshot operations with parent-project ownership checks."""

    def __init__(self, session: AsyncSession) -> None:
        """Build the service over a session + snapshot repo + project service."""
        self.session = session
        self.repo = ProjectSnapshotRepository(session)
        self.projects = ProjectService(session)

    # -- reads ---------------------------------------------------------------

    async def list_snapshots(
        self,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        group: SnapshotGroup | None = None,
        day: date | None = None,
        tz_offset_minutes: int = 0,
    ) -> Sequence[ProjectSnapshot]:
        """List a project's snapshots (optionally one local day), newest first."""
        await self.projects.get_authorized(project_id, user_id, Capability.VIEW)
        created_after: datetime | None = None
        created_before: datetime | None = None
        if day is not None:
            created_after, created_before = _local_day_to_utc_window(
                day, tz_offset_minutes
            )
        return await self.repo.list_for_project(
            project_id,
            kinds=_kinds_for_group(group),
            created_after=created_after,
            created_before=created_before,
        )

    async def calendar(
        self,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        year: int,
        month: int,
        group: SnapshotGroup | None = None,
        tz_offset_minutes: int = 0,
    ) -> dict[date, int]:
        """Count snapshots per local date within a local month (for calendar)."""
        await self.projects.get_authorized(project_id, user_id, Capability.VIEW)
        after, before = _local_month_to_utc_window(year, month, tz_offset_minutes)
        timestamps = await self.repo.created_ats_for_project(
            project_id,
            kinds=_kinds_for_group(group),
            created_after=after,
            created_before=before,
        )
        counts: dict[date, int] = {}
        shift = timedelta(minutes=tz_offset_minutes)
        for ts in timestamps:
            local_date = (ts + shift).date()
            counts[local_date] = counts.get(local_date, 0) + 1
        return counts

    async def get_snapshot(
        self,
        project_id: uuid.UUID,
        snapshot_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> ProjectSnapshot:
        """Return one accessible snapshot (with body) or raise NotFound."""
        await self.projects.get_authorized(project_id, user_id, Capability.VIEW)
        snapshot = await self.repo.get_by_id_and_project(snapshot_id, project_id)
        if snapshot is None:
            raise ProjectSnapshotNotFoundError(snapshot_id)
        return snapshot

    # -- writes --------------------------------------------------------------

    async def create_manual(
        self,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        label: str | None = None,
    ) -> ProjectSnapshot:
        """Snapshot the current project state as a labelled manual snapshot."""
        project, _role = await self.projects.get_authorized(
            project_id, user_id, Capability.CREATE_SNAPSHOT
        )
        existing = await self.repo.count_for_project(project_id, KIND_MANUAL)
        if existing >= settings.snapshot_manual_max:
            raise SnapshotLimitError(settings.snapshot_manual_max)
        return await self.repo.create(
            project_id=project_id,
            kind=KIND_MANUAL,
            label=label,
            dbml_text=project.dbml_text,
            layout=project.layout,
            content_hash=compute_content_hash(project.dbml_text, project.layout),
        )

    async def delete_manual(
        self,
        project_id: uuid.UUID,
        snapshot_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        """Delete a manual snapshot; auto snapshots are not user-deletable.

        Owner-only (DELETE_SNAPSHOT) — authorized before the snapshot lookup.
        """
        await self.projects.get_authorized(
            project_id, user_id, Capability.DELETE_SNAPSHOT
        )
        snapshot = await self.repo.get_by_id_and_project(snapshot_id, project_id)
        if snapshot is None:
            raise ProjectSnapshotNotFoundError(snapshot_id)
        if snapshot.kind != KIND_MANUAL:
            raise SnapshotNotDeletableError(snapshot_id)
        await self.repo.delete(snapshot)

    async def restore(
        self,
        project_id: uuid.UUID,
        snapshot_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> Project:
        """Restore a snapshot: snapshot current state, then overwrite the project.

        The target snapshot is left intact. Before overwriting, the project's
        current state is captured as a fine safety snapshot so an accidental
        restore is itself reversible. Restore is a content write — it requires
        EDIT and goes through update_project, so the edit lock applies.
        """
        project, _role = await self.projects.get_authorized(
            project_id, user_id, Capability.EDIT
        )
        target = await self.repo.get_by_id_and_project(snapshot_id, project_id)
        if target is None:
            raise ProjectSnapshotNotFoundError(snapshot_id)
        # Safety net: capture the soon-to-be-overwritten current state.
        await self.repo.create(
            project_id=project_id,
            kind=KIND_FINE,
            label=None,
            dbml_text=project.dbml_text,
            layout=project.layout,
            content_hash=compute_content_hash(project.dbml_text, project.layout),
        )
        return await self.projects.update_project(
            project_id,
            user_id,
            dbml_text=target.dbml_text,
            layout=target.layout,
        )


def _local_day_to_utc_window(
    day: date, tz_offset_minutes: int
) -> tuple[datetime, datetime]:
    """[local 00:00, +1 day) for `day`, expressed as aware-UTC bounds."""
    shift = timedelta(minutes=tz_offset_minutes)
    start_local_walltime = datetime(
        day.year, day.month, day.day, tzinfo=timezone.utc
    )
    start_utc = start_local_walltime - shift
    return start_utc, start_utc + timedelta(days=1)


def _local_month_to_utc_window(
    year: int, month: int, tz_offset_minutes: int
) -> tuple[datetime, datetime]:
    """[local month start, next month start) as aware-UTC bounds."""
    shift = timedelta(minutes=tz_offset_minutes)
    start_local_walltime = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end_local_walltime = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_local_walltime = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    return start_local_walltime - shift, end_local_walltime - shift
