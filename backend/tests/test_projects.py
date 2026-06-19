"""End-to-end project CRUD/ownership/autosave tests over the sqlite client."""
import uuid

from httpx import AsyncClient


# --- create -----------------------------------------------------------------


async def test_create_returns_201_and_body(
    authenticated_client: AsyncClient,
) -> None:
    response = await authenticated_client.post(
        "/api/projects",
        json={"name": "My ERD", "dbml_text": "table t {}"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "My ERD"
    assert body["dbml_text"] == "table t {}"
    assert body["layout"] == {}
    assert "id" in body
    assert "user_id" in body
    assert "created_at" in body
    assert "updated_at" in body


async def test_create_defaults_dbml_and_layout(
    authenticated_client: AsyncClient,
) -> None:
    response = await authenticated_client.post(
        "/api/projects", json={"name": "Bare"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["dbml_text"] == ""
    assert body["layout"] == {}


async def test_create_rejects_empty_name(
    authenticated_client: AsyncClient,
) -> None:
    response = await authenticated_client.post(
        "/api/projects", json={"name": ""}
    )
    assert response.status_code == 422


# --- list -------------------------------------------------------------------


async def test_list_returns_only_own_projects(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    alice = await authenticated_client.post(
        "/api/projects", json={"name": "Alice P"}
    )
    bob = await second_authenticated_client.post(
        "/api/projects", json={"name": "Bob P"}
    )
    alice_id = alice.json()["id"]
    bob_id = bob.json()["id"]

    listing = await authenticated_client.get("/api/projects")
    assert listing.status_code == 200
    ids = [p["id"] for p in listing.json()]
    assert alice_id in ids
    assert bob_id not in ids


# --- get --------------------------------------------------------------------


async def test_get_own_project_returns_200(
    authenticated_client: AsyncClient,
) -> None:
    created = await authenticated_client.post(
        "/api/projects", json={"name": "P1"}
    )
    project_id = created.json()["id"]

    fetched = await authenticated_client.get(f"/api/projects/{project_id}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == project_id


async def test_get_other_users_project_returns_404(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    created = await authenticated_client.post(
        "/api/projects", json={"name": "Alice secret"}
    )
    project_id = created.json()["id"]

    # Bob tries to read Alice's project -> 404 (not 403; no existence leak).
    bob_get = await second_authenticated_client.get(
        f"/api/projects/{project_id}"
    )
    assert bob_get.status_code == 404


async def test_get_missing_project_returns_404(
    authenticated_client: AsyncClient,
) -> None:
    missing = await authenticated_client.get(f"/api/projects/{uuid.uuid4()}")
    assert missing.status_code == 404


# --- patch / autosave -------------------------------------------------------


async def test_patch_autosave_persists_dbml_text(
    authenticated_client: AsyncClient,
) -> None:
    created = await authenticated_client.post(
        "/api/projects", json={"name": "P1", "dbml_text": "table t1 {}"}
    )
    project_id = created.json()["id"]

    patched = await authenticated_client.patch(
        f"/api/projects/{project_id}",
        json={"dbml_text": "table t1 {}\ntable t2 {}"},
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "P1"  # unchanged
    assert patched.json()["dbml_text"] == "table t1 {}\ntable t2 {}"

    # Re-fetch to prove persistence (survives a fresh request).
    fetched = await authenticated_client.get(f"/api/projects/{project_id}")
    assert fetched.json()["dbml_text"] == "table t1 {}\ntable t2 {}"


async def test_patch_autosave_persists_layout(
    authenticated_client: AsyncClient,
) -> None:
    created = await authenticated_client.post(
        "/api/projects", json={"name": "P1"}
    )
    project_id = created.json()["id"]

    layout = {"nodes": [{"id": "t1", "x": 10, "y": 20}]}
    patched = await authenticated_client.patch(
        f"/api/projects/{project_id}", json={"layout": layout}
    )
    assert patched.status_code == 200
    assert patched.json()["layout"] == layout

    fetched = await authenticated_client.get(f"/api/projects/{project_id}")
    assert fetched.json()["layout"] == layout


async def test_patch_rename_only_leaves_dbml_untouched(
    authenticated_client: AsyncClient,
) -> None:
    created = await authenticated_client.post(
        "/api/projects", json={"name": "Old", "dbml_text": "keep me"}
    )
    project_id = created.json()["id"]

    patched = await authenticated_client.patch(
        f"/api/projects/{project_id}", json={"name": "New"}
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "New"
    assert patched.json()["dbml_text"] == "keep me"  # unchanged


async def test_patch_other_users_project_returns_404(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    created = await authenticated_client.post(
        "/api/projects", json={"name": "Alice P"}
    )
    project_id = created.json()["id"]

    bob_patch = await second_authenticated_client.patch(
        f"/api/projects/{project_id}", json={"name": "hacked"}
    )
    assert bob_patch.status_code == 404


# --- delete -----------------------------------------------------------------


async def test_delete_own_returns_204_then_get_404(
    authenticated_client: AsyncClient,
) -> None:
    created = await authenticated_client.post(
        "/api/projects", json={"name": "P1"}
    )
    project_id = created.json()["id"]

    deleted = await authenticated_client.delete(f"/api/projects/{project_id}")
    assert deleted.status_code == 204

    fetched = await authenticated_client.get(f"/api/projects/{project_id}")
    assert fetched.status_code == 404


async def test_delete_other_users_project_returns_404(
    authenticated_client: AsyncClient,
    second_authenticated_client: AsyncClient,
) -> None:
    created = await authenticated_client.post(
        "/api/projects", json={"name": "Alice P"}
    )
    project_id = created.json()["id"]

    bob_delete = await second_authenticated_client.delete(
        f"/api/projects/{project_id}"
    )
    assert bob_delete.status_code == 404


async def test_delete_missing_project_returns_404(
    authenticated_client: AsyncClient,
) -> None:
    missing = await authenticated_client.delete(
        f"/api/projects/{uuid.uuid4()}"
    )
    assert missing.status_code == 404


async def test_create_defaults_glyph_and_color_null(
    authenticated_client: AsyncClient,
) -> None:
    response = await authenticated_client.post(
        "/api/projects", json={"name": "P"}
    )
    body = response.json()
    assert body["glyph"] is None
    assert body["color"] is None


async def test_patch_persists_glyph_and_color(
    authenticated_client: AsyncClient,
) -> None:
    created = await authenticated_client.post(
        "/api/projects", json={"name": "P1"}
    )
    pid = created.json()["id"]
    patched = await authenticated_client.patch(
        f"/api/projects/{pid}", json={"glyph": "🗄️", "color": "blue"}
    )
    assert patched.status_code == 200
    assert patched.json()["glyph"] == "🗄️"
    assert patched.json()["color"] == "blue"


async def test_patch_glyph_only_preserves_color(
    authenticated_client: AsyncClient,
) -> None:
    created = await authenticated_client.post(
        "/api/projects", json={"name": "P1"}
    )
    pid = created.json()["id"]
    await authenticated_client.patch(
        f"/api/projects/{pid}", json={"color": "teal"}
    )
    patched = await authenticated_client.patch(
        f"/api/projects/{pid}", json={"glyph": "📊"}
    )
    assert patched.json()["glyph"] == "📊"
    assert patched.json()["color"] == "teal"  # preserved


async def test_patch_rejects_too_long_glyph(
    authenticated_client: AsyncClient,
) -> None:
    created = await authenticated_client.post(
        "/api/projects", json={"name": "P1"}
    )
    pid = created.json()["id"]
    patched = await authenticated_client.patch(
        f"/api/projects/{pid}", json={"glyph": "123456789"}
    )
    assert patched.status_code == 422


# --- 401 unauthenticated ----------------------------------------------------


async def test_create_requires_auth(client: AsyncClient) -> None:
    response = await client.post("/api/projects", json={"name": "x"})
    assert response.status_code == 401


async def test_list_requires_auth(client: AsyncClient) -> None:
    response = await client.get("/api/projects")
    assert response.status_code == 401


async def test_get_requires_auth(client: AsyncClient) -> None:
    response = await client.get(f"/api/projects/{uuid.uuid4()}")
    assert response.status_code == 401


async def test_patch_requires_auth(client: AsyncClient) -> None:
    response = await client.patch(
        f"/api/projects/{uuid.uuid4()}", json={"name": "x"}
    )
    assert response.status_code == 401


async def test_delete_requires_auth(client: AsyncClient) -> None:
    response = await client.delete(f"/api/projects/{uuid.uuid4()}")
    assert response.status_code == 401
