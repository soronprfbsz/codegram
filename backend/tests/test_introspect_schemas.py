"""DTO tests for the introspect request/response schemas."""
import pytest
from pydantic import ValidationError

from app.schemas.introspect import IntrospectRequest, IntrospectResponse


def test_request_defaults_and_db_schema_field():
    req = IntrospectRequest(
        dialect="postgresql",
        host="db.example.com",
        port=5432,
        username="u",
        password="p",
        database="app",
    )
    assert req.db_schema is None
    assert req.ssl is False
    # `schema` must NOT be a field (it shadows BaseModel); the field is db_schema.
    assert "schema" not in IntrospectRequest.model_fields
    assert "db_schema" in IntrospectRequest.model_fields
    assert (
        IntrospectRequest(
            dialect="postgresql",
            host="h",
            port=5432,
            username="u",
            password="p",
            database="app",
            db_schema="sales",
        ).db_schema
        == "sales"
    )


def test_request_rejects_unknown_dialect():
    with pytest.raises(ValidationError):
        IntrospectRequest(
            dialect="oracle",
            host="h",
            port=1521,
            username="u",
            password="p",
            database="app",
        )


def test_response_shape():
    resp = IntrospectResponse(
        import_dialect="mysql", ddl="CREATE TABLE t (id INT);", table_count=1
    )
    assert resp.import_dialect == "mysql"
    assert resp.ddl == "CREATE TABLE t (id INT);"
    assert resp.table_count == 1
