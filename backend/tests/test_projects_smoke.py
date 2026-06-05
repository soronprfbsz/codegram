"""Smoke tests: the projects router is mounted under /api and auth-gated."""
from httpx import AsyncClient


async def test_list_requires_auth(client: AsyncClient) -> None:
    """Unauthenticated LIST returns 401 (current_active_user gate)."""
    response = await client.get("/api/projects")
    assert response.status_code == 401


async def test_authenticated_list_is_empty_initially(
    authenticated_client: AsyncClient,
) -> None:
    """A fresh authenticated user has no projects (200 + [])."""
    response = await authenticated_client.get("/api/projects")
    assert response.status_code == 200
    assert response.json() == []
