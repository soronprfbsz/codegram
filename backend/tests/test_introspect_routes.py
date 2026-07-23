"""Route tests for POST /api/introspect (service mocked — no live DB)."""
import pytest

import app.api.routes.introspect as introspect_route
from app.services.introspect import (
    ConnectionFailedError,
    NoTablesFoundError,
    IntrospectResult,
)

PAYLOAD = {
    "dialect": "postgresql",
    "host": "db",
    "port": 5432,
    "username": "u",
    "password": "p",
    "database": "app",
}


async def test_requires_auth(client):
    resp = await client.post("/api/introspect", json=PAYLOAD)
    assert resp.status_code == 401


async def test_success_returns_ddl(authenticated_client, monkeypatch):
    def fake(req):
        return IntrospectResult(
            import_dialect="postgres",
            ddl="CREATE TABLE users (id INTEGER);",
            table_count=1,
        )

    monkeypatch.setattr(introspect_route, "introspect_to_ddl", fake)
    resp = await authenticated_client.post("/api/introspect", json=PAYLOAD)
    assert resp.status_code == 200
    body = resp.json()
    assert body["import_dialect"] == "postgres"
    assert body["table_count"] == 1
    assert "CREATE TABLE users" in body["ddl"]


async def test_connection_failure_maps_to_502(authenticated_client, monkeypatch):
    def fake(req):
        raise ConnectionFailedError("접속 실패")

    monkeypatch.setattr(introspect_route, "introspect_to_ddl", fake)
    resp = await authenticated_client.post("/api/introspect", json=PAYLOAD)
    assert resp.status_code == 502
    assert resp.json()["detail"] == "접속 실패"


async def test_no_tables_maps_to_400(authenticated_client, monkeypatch):
    def fake(req):
        raise NoTablesFoundError("테이블 없음")

    monkeypatch.setattr(introspect_route, "introspect_to_ddl", fake)
    resp = await authenticated_client.post("/api/introspect", json=PAYLOAD)
    assert resp.status_code == 400
    assert resp.json()["detail"] == "테이블 없음"


async def test_introspect_clickhouse_returns_tables(authenticated_client, monkeypatch):
    from app.schemas.introspect import IntrospectedColumn, IntrospectedTable

    def fake(req):
        assert req.dialect == "clickhouse"
        return IntrospectResult(
            table_count=1,
            tables=[
                IntrospectedTable(
                    name="events",
                    engine="MergeTree",
                    columns=[
                        IntrospectedColumn(
                            name="org_id", type="LowCardinality(String)", comment=None
                        )
                    ],
                )
            ],
        )

    monkeypatch.setattr(introspect_route, "introspect_to_ddl", fake)
    resp = await authenticated_client.post(
        "/api/introspect",
        json={
            "dialect": "clickhouse",
            "host": "clickhouse.example.test",
            "port": 8123,
            "username": "ch_user",
            "password": "x",
            "database": "analytics",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ddl"] is None
    assert body["table_count"] == 1
    assert body["tables"][0]["name"] == "events"
    assert body["tables"][0]["engine"] == "MergeTree"
    assert body["tables"][0]["columns"][0]["type"] == "LowCardinality(String)"
