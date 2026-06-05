"""Tests for the /api/health endpoint."""


# No @pytest.mark.anyio: the suite standardizes on pytest-asyncio auto mode
# (configured in pyproject.toml), which runs this async test and the async
# fixtures (client/test_session) on the same event loop.
async def test_health_returns_ok(client):
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
