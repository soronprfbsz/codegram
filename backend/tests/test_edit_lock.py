"""End-to-end edit-lock route tests (acquire/status/force/release + 409s)."""
from httpx import AsyncClient


async def _project_shared_with_bob(
    alice: AsyncClient, role: str = "editor"
) -> str:
    res = await alice.post("/api/projects", json={"name": "Shared"})
    pid = res.json()["id"]
    await alice.post(
        f"/api/projects/{pid}/members",
        json={"email": "bob@example.com", "role": role},
    )
    return pid


async def test_acquire_status_and_conflict(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    pid = await _project_shared_with_bob(authenticated_client)

    acq = await authenticated_client.post(f"/api/projects/{pid}/edit-lock")
    assert acq.status_code == 200
    assert acq.json()["is_me"] is True

    seen = await second_authenticated_client.get(f"/api/projects/{pid}/edit-lock")
    assert seen.status_code == 200
    assert seen.json()["locked"] is True
    assert seen.json()["is_me"] is False
    assert seen.json()["locked_by_email"] == "alice@example.com"

    conflict = await second_authenticated_client.post(
        f"/api/projects/{pid}/edit-lock"
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["reason"] == "edit_locked"


async def test_patch_conflict_when_other_holds_lock(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    pid = await _project_shared_with_bob(authenticated_client)
    await authenticated_client.post(f"/api/projects/{pid}/edit-lock")  # alice holds

    patched = await second_authenticated_client.patch(
        f"/api/projects/{pid}", json={"dbml_text": "table t {}"}
    )
    assert patched.status_code == 409
    assert patched.json()["detail"]["reason"] == "edit_locked"


async def test_patch_stale_version_is_409(
    authenticated_client: AsyncClient,
) -> None:
    created = await authenticated_client.post("/api/projects", json={"name": "P"})
    pid = created.json()["id"]
    assert created.json()["version"] == 0

    patched = await authenticated_client.patch(
        f"/api/projects/{pid}", json={"dbml_text": "x", "version": 99}
    )
    assert patched.status_code == 409
    assert patched.json()["detail"]["reason"] == "stale_version"

    ok = await authenticated_client.patch(
        f"/api/projects/{pid}", json={"dbml_text": "x", "version": 0}
    )
    assert ok.status_code == 200
    assert ok.json()["version"] == 1


async def test_owner_force_takeover(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    pid = await _project_shared_with_bob(authenticated_client)
    await second_authenticated_client.post(f"/api/projects/{pid}/edit-lock")  # bob holds

    forced = await authenticated_client.post(f"/api/projects/{pid}/edit-lock/force")
    assert forced.status_code == 200
    assert forced.json()["is_me"] is True

    bob_patch = await second_authenticated_client.patch(
        f"/api/projects/{pid}", json={"dbml_text": "nope"}
    )
    assert bob_patch.status_code == 409


async def test_release_allows_next_editor(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    pid = await _project_shared_with_bob(authenticated_client)
    await authenticated_client.post(f"/api/projects/{pid}/edit-lock")
    released = await authenticated_client.delete(f"/api/projects/{pid}/edit-lock")
    assert released.status_code == 204

    bob_acq = await second_authenticated_client.post(f"/api/projects/{pid}/edit-lock")
    assert bob_acq.status_code == 200
    assert bob_acq.json()["is_me"] is True


async def test_viewer_can_see_lock_but_not_acquire(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    pid = await _project_shared_with_bob(authenticated_client, role="viewer")

    seen = await second_authenticated_client.get(f"/api/projects/{pid}/edit-lock")
    assert seen.status_code == 200
    assert seen.json()["locked"] is False

    acq = await second_authenticated_client.post(f"/api/projects/{pid}/edit-lock")
    assert acq.status_code == 403
