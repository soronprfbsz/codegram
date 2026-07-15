"""Tests for project snapshot endpoints and the snapshot service (ADR-0014)."""
import uuid
from datetime import datetime, timezone

import app.core.config as config_module
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project_snapshot import ProjectSnapshot
from app.models.user import User
from app.services.project import ProjectService
from app.services.project_snapshot import (
    KIND_COARSE,
    KIND_FINE,
    KIND_MANUAL,
    ProjectSnapshotNotFoundError,
    ProjectSnapshotService,
    SnapshotLimitError,
    SnapshotNotDeletableError,
    compute_content_hash,
)


# --- helpers ---------------------------------------------------------------
async def _make_user(session: AsyncSession, email: str) -> uuid.UUID:
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password="x",
        is_active=True,
        is_superuser=False,
        is_verified=False,
    )
    session.add(user)
    await session.flush()
    return user.id


async def _insert_snapshot(
    session: AsyncSession,
    project_id: uuid.UUID,
    kind: str,
    created_at: datetime,
    *,
    label: str | None = None,
    dbml_text: str = "table t {}",
) -> ProjectSnapshot:
    snap = ProjectSnapshot(
        project_id=project_id,
        kind=kind,
        label=label,
        dbml_text=dbml_text,
        layout={},
        content_hash=compute_content_hash(dbml_text, {}),
        created_at=created_at,
    )
    session.add(snap)
    await session.flush()
    return snap


async def _create_project(client: AsyncClient, name: str = "P1") -> str:
    resp = await client.post(
        "/api/projects", json={"name": name, "dbml_text": "table a {}"}
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# --- pure hash unit --------------------------------------------------------
def test_content_hash_is_stable_and_content_sensitive() -> None:
    assert compute_content_hash("a", {"x": 1}) == compute_content_hash(
        "a", {"x": 1}
    )
    # key order does not matter (canonical json)
    assert compute_content_hash("a", {"x": 1, "y": 2}) == compute_content_hash(
        "a", {"y": 2, "x": 1}
    )
    assert compute_content_hash("a", {"x": 1}) != compute_content_hash(
        "b", {"x": 1}
    )
    assert compute_content_hash("a", {"x": 1}) != compute_content_hash(
        "a", {"x": 2}
    )


# --- endpoint: create manual ----------------------------------------------
async def test_create_manual_snapshot_returns_201(
    authenticated_client: AsyncClient,
) -> None:
    project_id = await _create_project(authenticated_client)
    resp = await authenticated_client.post(
        f"/api/projects/{project_id}/snapshots", json={"label": "before refactor"}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["project_id"] == project_id
    assert body["kind"] == KIND_MANUAL
    assert body["label"] == "before refactor"
    assert body["dbml_text"] == "table a {}"
    assert "content_hash" in body and len(body["content_hash"]) == 64


async def test_snapshot_requires_auth(client: AsyncClient) -> None:
    resp = await client.post(
        f"/api/projects/{uuid.uuid4()}/snapshots", json={}
    )
    assert resp.status_code == 401


async def test_other_user_cannot_snapshot(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    project_id = await _create_project(authenticated_client, "Alice")
    resp = await second_authenticated_client.post(
        f"/api/projects/{project_id}/snapshots", json={}
    )
    assert resp.status_code == 404


# --- endpoint: list (meta only) -------------------------------------------
async def test_list_returns_meta_without_body(
    authenticated_client: AsyncClient,
) -> None:
    project_id = await _create_project(authenticated_client)
    await authenticated_client.post(
        f"/api/projects/{project_id}/snapshots", json={"label": "one"}
    )
    resp = await authenticated_client.get(
        f"/api/projects/{project_id}/snapshots?group=manual"
    )
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["label"] == "one"
    # meta is lightweight: no restorable body
    assert "dbml_text" not in rows[0]
    assert "layout" not in rows[0]


# --- endpoint: get single (full body) -------------------------------------
async def test_get_single_includes_body(
    authenticated_client: AsyncClient,
) -> None:
    project_id = await _create_project(authenticated_client)
    created = await authenticated_client.post(
        f"/api/projects/{project_id}/snapshots", json={}
    )
    snap_id = created.json()["id"]
    resp = await authenticated_client.get(
        f"/api/projects/{project_id}/snapshots/{snap_id}"
    )
    assert resp.status_code == 200
    assert resp.json()["dbml_text"] == "table a {}"
    assert resp.json()["layout"] == {}


async def test_get_missing_snapshot_404(
    authenticated_client: AsyncClient,
) -> None:
    project_id = await _create_project(authenticated_client)
    resp = await authenticated_client.get(
        f"/api/projects/{project_id}/snapshots/{uuid.uuid4()}"
    )
    assert resp.status_code == 404


# --- endpoint: delete (manual only) ---------------------------------------
async def test_delete_manual_snapshot(
    authenticated_client: AsyncClient,
) -> None:
    project_id = await _create_project(authenticated_client)
    created = await authenticated_client.post(
        f"/api/projects/{project_id}/snapshots", json={}
    )
    snap_id = created.json()["id"]
    resp = await authenticated_client.delete(
        f"/api/projects/{project_id}/snapshots/{snap_id}"
    )
    assert resp.status_code == 204
    listing = await authenticated_client.get(
        f"/api/projects/{project_id}/snapshots?group=manual"
    )
    assert listing.json() == []


# --- endpoint: restore -----------------------------------------------------
async def test_restore_overwrites_project_and_keeps_target(
    authenticated_client: AsyncClient,
) -> None:
    project_id = await _create_project(authenticated_client)
    # snapshot the original state
    snap = await authenticated_client.post(
        f"/api/projects/{project_id}/snapshots", json={"label": "v1"}
    )
    snap_id = snap.json()["id"]
    # edit the project away from v1
    await authenticated_client.patch(
        f"/api/projects/{project_id}", json={"dbml_text": "table CHANGED {}"}
    )
    # restore
    resp = await authenticated_client.post(
        f"/api/projects/{project_id}/snapshots/{snap_id}/restore"
    )
    assert resp.status_code == 200
    assert resp.json()["dbml_text"] == "table a {}"
    # the project really changed back
    proj = await authenticated_client.get(f"/api/projects/{project_id}")
    assert proj.json()["dbml_text"] == "table a {}"
    # target snapshot survives restore
    still = await authenticated_client.get(
        f"/api/projects/{project_id}/snapshots/{snap_id}"
    )
    assert still.status_code == 200
    # a safety (auto_fine) snapshot of the pre-restore state was created
    autos = await authenticated_client.get(
        f"/api/projects/{project_id}/snapshots?group=auto"
    )
    safety = autos.json()
    assert len(safety) == 1
    assert safety[0]["kind"] == KIND_FINE


# --- endpoint: month parse error ------------------------------------------
async def test_calendar_bad_month_400(
    authenticated_client: AsyncClient,
) -> None:
    project_id = await _create_project(authenticated_client)
    resp = await authenticated_client.get(
        f"/api/projects/{project_id}/snapshots/calendar?month=2026-13"
    )
    assert resp.status_code == 400


async def test_calendar_out_of_range_year_400(
    authenticated_client: AsyncClient,
) -> None:
    """A huge year must be a clean 400, not an uncaught datetime overflow (500)."""
    project_id = await _create_project(authenticated_client)
    resp = await authenticated_client.get(
        f"/api/projects/{project_id}/snapshots/calendar?month=99999999-01"
    )
    assert resp.status_code == 400


async def test_list_rejects_absurd_tz_offset(
    authenticated_client: AsyncClient,
) -> None:
    """An out-of-range tz_offset must be a 422, not a timedelta overflow (500)."""
    project_id = await _create_project(authenticated_client)
    resp = await authenticated_client.get(
        f"/api/projects/{project_id}/snapshots?group=auto&date=2026-06-22&tz_offset=999999999"
    )
    assert resp.status_code == 422


# --- service: manual cap ---------------------------------------------------
async def test_manual_cap_raises(
    test_session: AsyncSession, monkeypatch
) -> None:
    monkeypatch.setattr(config_module.settings, "snapshot_manual_max", 2)
    user_id = await _make_user(test_session, "cap@example.com")
    project = await ProjectService(test_session).create_project(
        user_id=user_id, name="P"
    )
    service = ProjectSnapshotService(test_session)
    await service.create_manual(project.id, user_id, label="1")
    await service.create_manual(project.id, user_id, label="2")
    try:
        await service.create_manual(project.id, user_id, label="3")
        assert False, "expected SnapshotLimitError"
    except SnapshotLimitError:
        pass


# --- service: auto snapshots are not deletable ----------------------------
async def test_delete_auto_snapshot_forbidden(
    test_session: AsyncSession,
) -> None:
    user_id = await _make_user(test_session, "auto@example.com")
    project = await ProjectService(test_session).create_project(
        user_id=user_id, name="P"
    )
    auto = await _insert_snapshot(
        test_session,
        project.id,
        KIND_FINE,
        datetime(2026, 6, 22, 12, 0, tzinfo=timezone.utc),
    )
    service = ProjectSnapshotService(test_session)
    try:
        await service.delete_manual(project.id, auto.id, user_id)
        assert False, "expected SnapshotNotDeletableError"
    except SnapshotNotDeletableError:
        pass


# --- service: cross-user get is NotFound ----------------------------------
async def test_get_snapshot_cross_user(test_session: AsyncSession) -> None:
    owner = await _make_user(test_session, "owner@example.com")
    intruder = await _make_user(test_session, "intruder@example.com")
    project = await ProjectService(test_session).create_project(
        user_id=owner, name="P"
    )
    snap = await _insert_snapshot(
        test_session,
        project.id,
        KIND_MANUAL,
        datetime(2026, 6, 22, 12, 0, tzinfo=timezone.utc),
    )
    service = ProjectSnapshotService(test_session)
    try:
        await service.get_snapshot(project.id, snap.id, intruder)
        assert False, "expected not found for intruder"
    except Exception as exc:  # ProjectNotFoundError (parent ownership) is fine
        assert "intruder" not in str(exc)


# --- service: local-day window filtering ----------------------------------
async def test_list_by_local_day_respects_tz_offset(
    test_session: AsyncSession,
) -> None:
    from datetime import date

    user_id = await _make_user(test_session, "tz@example.com")
    project = await ProjectService(test_session).create_project(
        user_id=user_id, name="P"
    )
    # UTC 2026-06-22 23:30 -> KST (+540) is 2026-06-23 08:30
    await _insert_snapshot(
        test_session,
        project.id,
        KIND_MANUAL,
        datetime(2026, 6, 22, 23, 30, tzinfo=timezone.utc),
    )
    service = ProjectSnapshotService(test_session)
    kst_23 = await service.list_snapshots(
        project.id, user_id, day=date(2026, 6, 23), tz_offset_minutes=540
    )
    assert len(kst_23) == 1
    kst_22 = await service.list_snapshots(
        project.id, user_id, day=date(2026, 6, 22), tz_offset_minutes=540
    )
    assert len(kst_22) == 0
    utc_22 = await service.list_snapshots(
        project.id, user_id, day=date(2026, 6, 22), tz_offset_minutes=0
    )
    assert len(utc_22) == 1


# --- service: calendar bucketing across tz boundary -----------------------
async def test_calendar_buckets_by_local_date(
    test_session: AsyncSession,
) -> None:
    from datetime import date

    user_id = await _make_user(test_session, "cal@example.com")
    project = await ProjectService(test_session).create_project(
        user_id=user_id, name="P"
    )
    await _insert_snapshot(
        test_session,
        project.id,
        KIND_MANUAL,
        datetime(2026, 6, 22, 23, 30, tzinfo=timezone.utc),
    )
    service = ProjectSnapshotService(test_session)
    utc = await service.calendar(
        project.id, user_id, year=2026, month=6, tz_offset_minutes=0
    )
    assert utc == {date(2026, 6, 22): 1}
    kst = await service.calendar(
        project.id, user_id, year=2026, month=6, tz_offset_minutes=540
    )
    assert kst == {date(2026, 6, 23): 1}


# --- service: per-kind dedup hash -----------------------------------------
async def test_latest_hash_is_per_kind(test_session: AsyncSession) -> None:
    user_id = await _make_user(test_session, "kind@example.com")
    project = await ProjectService(test_session).create_project(
        user_id=user_id, name="P"
    )
    service = ProjectSnapshotService(test_session)
    await _insert_snapshot(
        test_session,
        project.id,
        KIND_FINE,
        datetime(2026, 6, 22, 12, 0, tzinfo=timezone.utc),
        dbml_text="fine state",
    )
    await _insert_snapshot(
        test_session,
        project.id,
        KIND_COARSE,
        datetime(2026, 6, 22, 12, 0, tzinfo=timezone.utc),
        dbml_text="coarse state",
    )
    fine_hash = await service.repo.latest_hash(project.id, KIND_FINE)
    coarse_hash = await service.repo.latest_hash(project.id, KIND_COARSE)
    assert fine_hash == compute_content_hash("fine state", {})
    assert coarse_hash == compute_content_hash("coarse state", {})
    assert fine_hash != coarse_hash


# --- author attribution ----------------------------------------------------
async def test_manual_snapshot_records_author_email(
    authenticated_client: AsyncClient,
) -> None:
    """A manual snapshot is authored by the acting user; email surfaces in
    the create response AND the list row."""
    project_id = await _create_project(authenticated_client)
    created = await authenticated_client.post(
        f"/api/projects/{project_id}/snapshots", json={"label": "v1"}
    )
    assert created.status_code == 201
    assert created.json()["created_by_email"] == "alice@example.com"
    rows = (
        await authenticated_client.get(
            f"/api/projects/{project_id}/snapshots?group=manual"
        )
    ).json()
    assert rows[0]["created_by_email"] == "alice@example.com"


async def test_content_write_sets_last_editor_metadata_does_not(
    test_session: AsyncSession,
) -> None:
    """A content write (dbml/layout) records last_edited_by; a metadata-only
    write (name) leaves it untouched."""
    owner = await _make_user(test_session, "editor@example.com")
    svc = ProjectService(test_session)
    project = await svc.create_project(user_id=owner, name="P")
    # start from a cleared attribution to make the distinction observable
    project.last_edited_by = None
    await test_session.flush()

    await svc.update_project(project.id, owner, name="renamed")  # metadata only
    assert project.last_edited_by is None

    await svc.update_project(project.id, owner, dbml_text="table x {}")  # content
    assert project.last_edited_by == owner


async def test_list_author_email_null_for_unattributed_snapshot(
    test_session: AsyncSession,
) -> None:
    """A snapshot with no created_by (pre-feature / auto never-edited) lists
    with created_by_email = None."""
    owner = await _make_user(test_session, "legacy@example.com")
    project = await ProjectService(test_session).create_project(
        user_id=owner, name="P"
    )
    await _insert_snapshot(
        test_session,
        project.id,
        KIND_MANUAL,
        datetime(2026, 6, 22, 12, 0, tzinfo=timezone.utc),
    )
    rows = await ProjectSnapshotService(test_session).list_snapshots(
        project.id, owner, group="manual"
    )
    assert len(rows) == 1
    _snap, email = rows[0]
    assert email is None


async def test_restore_safety_snapshot_attributed_to_restorer(
    authenticated_client: AsyncClient,
) -> None:
    """Restoring captures a safety snapshot authored by the restoring user."""
    project_id = await _create_project(authenticated_client)
    created = await authenticated_client.post(
        f"/api/projects/{project_id}/snapshots", json={"label": "v1"}
    )
    snap_id = created.json()["id"]
    restore = await authenticated_client.post(
        f"/api/projects/{project_id}/snapshots/{snap_id}/restore"
    )
    assert restore.status_code == 200
    autos = (
        await authenticated_client.get(
            f"/api/projects/{project_id}/snapshots?group=auto"
        )
    ).json()
    assert len(autos) == 1
    assert autos[0]["created_by_email"] == "alice@example.com"
