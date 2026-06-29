"""Role-based access over snapshot routes (ADR-0015 Phase 5)."""
from httpx import AsyncClient


async def _shared_with_snapshot(alice: AsyncClient, role: str) -> tuple[str, str]:
    """Create a project shared with bob at `role` + one manual snapshot.

    Returns (project_id, snapshot_id).
    """
    pid = (await alice.post("/api/projects", json={"name": "P"})).json()["id"]
    await alice.post(
        f"/api/projects/{pid}/members",
        json={"email": "bob@example.com", "role": role},
    )
    sid = (
        await alice.post(f"/api/projects/{pid}/snapshots", json={"label": "v1"})
    ).json()["id"]
    return pid, sid


async def test_viewer_reads_history_but_cannot_mutate(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    pid, sid = await _shared_with_snapshot(authenticated_client, "viewer")
    bob = second_authenticated_client

    assert (await bob.get(f"/api/projects/{pid}/snapshots")).status_code == 200
    assert (
        await bob.get(f"/api/projects/{pid}/snapshots/{sid}")
    ).status_code == 200

    assert (
        await bob.post(f"/api/projects/{pid}/snapshots", json={"label": "x"})
    ).status_code == 403
    assert (
        await bob.delete(f"/api/projects/{pid}/snapshots/{sid}")
    ).status_code == 403
    assert (
        await bob.post(f"/api/projects/{pid}/snapshots/{sid}/restore")
    ).status_code == 403


async def test_editor_can_create_and_restore_but_not_delete(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    pid, sid = await _shared_with_snapshot(authenticated_client, "editor")
    bob = second_authenticated_client

    assert (
        await bob.post(f"/api/projects/{pid}/snapshots", json={"label": "bob"})
    ).status_code == 201
    assert (
        await bob.post(f"/api/projects/{pid}/snapshots/{sid}/restore")
    ).status_code == 200
    # Deleting snapshots is owner-only.
    assert (
        await bob.delete(f"/api/projects/{pid}/snapshots/{sid}")
    ).status_code == 403


async def test_restore_conflicts_when_other_holds_lock(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    pid, sid = await _shared_with_snapshot(authenticated_client, "editor")
    # Alice holds the edit lock; bob's restore is a content write -> 409.
    await authenticated_client.post(f"/api/projects/{pid}/edit-lock")

    restored = await second_authenticated_client.post(
        f"/api/projects/{pid}/snapshots/{sid}/restore"
    )
    assert restored.status_code == 409
    assert restored.json()["detail"]["reason"] == "edit_locked"
