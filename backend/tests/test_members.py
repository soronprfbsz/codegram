"""End-to-end membership route tests (invite/list/role/remove/leave)."""
from httpx import AsyncClient


async def _create_project(ac: AsyncClient, name: str = "Shared") -> str:
    res = await ac.post("/api/projects", json={"name": name})
    return res.json()["id"]


async def test_owner_invites_then_roster_lists_owner_and_member(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    pid = await _create_project(authenticated_client)

    invited = await authenticated_client.post(
        f"/api/projects/{pid}/members",
        json={"email": "bob@example.com", "role": "editor"},
    )
    assert invited.status_code == 201
    assert invited.json()["email"] == "bob@example.com"
    assert invited.json()["role"] == "editor"

    roster = await authenticated_client.get(f"/api/projects/{pid}/members")
    assert roster.status_code == 200
    pairs = {(m["email"], m["role"]) for m in roster.json()}
    assert ("alice@example.com", "owner") in pairs
    assert ("bob@example.com", "editor") in pairs


async def test_invite_unknown_email_404_and_bad_role_422(
    authenticated_client: AsyncClient,
) -> None:
    pid = await _create_project(authenticated_client)

    ghost = await authenticated_client.post(
        f"/api/projects/{pid}/members",
        json={"email": "ghost@example.com", "role": "editor"},
    )
    assert ghost.status_code == 404

    bad_role = await authenticated_client.post(
        f"/api/projects/{pid}/members",
        json={"email": "bob@example.com", "role": "owner"},
    )
    assert bad_role.status_code == 422


async def test_invite_existing_member_conflicts(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    pid = await _create_project(authenticated_client)
    body = {"email": "bob@example.com", "role": "viewer"}
    assert (await authenticated_client.post(f"/api/projects/{pid}/members", json=body)).status_code == 201
    again = await authenticated_client.post(f"/api/projects/{pid}/members", json=body)
    assert again.status_code == 409


async def test_non_member_invite_404_editor_invite_403(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    pid = await _create_project(authenticated_client)
    invite = {"email": "ghost@example.com", "role": "viewer"}

    # Bob has no role -> existence hidden (404).
    assert (
        await second_authenticated_client.post(
            f"/api/projects/{pid}/members", json=invite
        )
    ).status_code == 404

    # Make Bob an editor; editors cannot manage members -> 403.
    await authenticated_client.post(
        f"/api/projects/{pid}/members",
        json={"email": "bob@example.com", "role": "editor"},
    )
    assert (
        await second_authenticated_client.post(
            f"/api/projects/{pid}/members", json=invite
        )
    ).status_code == 403


async def test_update_role_then_remove_revokes_access(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    pid = await _create_project(authenticated_client)
    await authenticated_client.post(
        f"/api/projects/{pid}/members",
        json={"email": "bob@example.com", "role": "viewer"},
    )
    # Find bob's user_id from the roster.
    roster = await authenticated_client.get(f"/api/projects/{pid}/members")
    bob_id = next(m["user_id"] for m in roster.json() if m["email"] == "bob@example.com")

    promoted = await authenticated_client.patch(
        f"/api/projects/{pid}/members/{bob_id}", json={"role": "editor"}
    )
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "editor"

    removed = await authenticated_client.delete(
        f"/api/projects/{pid}/members/{bob_id}"
    )
    assert removed.status_code == 204
    # Bob no longer has access.
    assert (
        await second_authenticated_client.get(f"/api/projects/{pid}")
    ).status_code == 404


async def test_transfer_ownership_swaps_owner_and_editor(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    pid = await _create_project(authenticated_client)
    await authenticated_client.post(
        f"/api/projects/{pid}/members",
        json={"email": "bob@example.com", "role": "viewer"},
    )
    roster = await authenticated_client.get(f"/api/projects/{pid}/members")
    bob_id = next(
        m["user_id"] for m in roster.json() if m["email"] == "bob@example.com"
    )

    transferred = await authenticated_client.post(
        f"/api/projects/{pid}/members/{bob_id}/transfer-ownership"
    )
    assert transferred.status_code == 200
    pairs = {(m["email"], m["role"]) for m in transferred.json()}
    assert ("bob@example.com", "owner") in pairs
    assert ("alice@example.com", "editor") in pairs

    # Bob (new owner) can now manage members; Alice (now editor) cannot.
    assert (
        await second_authenticated_client.post(
            f"/api/projects/{pid}/members",
            json={"email": "ghost@example.com", "role": "viewer"},
        )
    ).status_code == 404  # unknown email, but authorized as owner
    assert (
        await authenticated_client.post(
            f"/api/projects/{pid}/members/{bob_id}/transfer-ownership"
        )
    ).status_code == 403  # Alice is only an editor now


async def test_transfer_to_non_member_404(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    import uuid

    pid = await _create_project(authenticated_client)
    res = await authenticated_client.post(
        f"/api/projects/{pid}/members/{uuid.uuid4()}/transfer-ownership"
    )
    assert res.status_code == 404


async def test_member_leaves_owner_cannot_leave(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    pid = await _create_project(authenticated_client)
    await authenticated_client.post(
        f"/api/projects/{pid}/members",
        json={"email": "bob@example.com", "role": "viewer"},
    )

    left = await second_authenticated_client.delete(
        f"/api/projects/{pid}/members/me"
    )
    assert left.status_code == 204
    assert (
        await second_authenticated_client.get(f"/api/projects/{pid}")
    ).status_code == 404

    # Owner has no membership to leave.
    owner_leave = await authenticated_client.delete(
        f"/api/projects/{pid}/members/me"
    )
    assert owner_leave.status_code == 400
