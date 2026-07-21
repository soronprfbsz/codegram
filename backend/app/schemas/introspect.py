"""DTOs for DB introspection (transient — no persistence). See ADR-0008.

`db_schemas` names the target PostgreSQL namespaces: `schema` would shadow a
pydantic BaseModel attribute. MariaDB ignores it (the connected database IS the
scope).
"""
from typing import Literal

from pydantic import BaseModel, Field


class IntrospectRequest(BaseModel):
    """Body for POST /api/introspect. Credentials are used once, never stored."""

    dialect: Literal["postgresql", "mariadb", "clickhouse"]
    host: str = Field(min_length=1)
    port: int = Field(gt=0, le=65535)
    username: str = Field(min_length=1)
    # Empty default is intentional: passwordless connections to local/dev DBs
    # are allowed. The value is transient and never stored.
    password: str = ""
    database: str = Field(min_length=1)
    # PostgreSQL: target namespaces to reflect (default ["public"]). Empty/None
    # means ["public"]. MariaDB ignores this (the connected database IS the scope).
    db_schemas: list[str] | None = None
    ssl: bool = False


class IntrospectedColumn(BaseModel):
    """One ClickHouse column: name + full type text + optional comment."""

    name: str
    type: str
    comment: str | None = None


class IntrospectedTable(BaseModel):
    """One ClickHouse table/view/dictionary: name + engine + ordered columns."""

    name: str
    engine: str | None = None
    columns: list[IntrospectedColumn]


class IntrospectResponse(BaseModel):
    """PostgreSQL/MariaDB return `ddl` + `import_dialect` (ADR-0002/0008).
    ClickHouse returns structured `tables` instead (ADR-0021)."""

    import_dialect: Literal["postgres", "mysql"] | None = None
    ddl: str | None = None
    tables: list[IntrospectedTable] | None = None
    table_count: int


class SchemaListResponse(BaseModel):
    """Backend returns the selectable schema names (PostgreSQL)."""

    schemas: list[str]
