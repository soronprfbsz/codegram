"""DTOs for DB introspection (transient — no persistence). See ADR-0008.

`db_schema` (not `schema`) names the target PostgreSQL namespace: `schema`
would shadow a pydantic BaseModel attribute. MariaDB ignores it (the connected
database IS the scope).
"""
from typing import Literal

from pydantic import BaseModel, Field


class IntrospectRequest(BaseModel):
    """Body for POST /api/introspect. Credentials are used once, never stored."""

    dialect: Literal["postgresql", "mariadb"]
    host: str = Field(min_length=1)
    port: int = Field(gt=0, le=65535)
    username: str = Field(min_length=1)
    password: str = ""
    database: str = Field(min_length=1)
    db_schema: str | None = None
    ssl: bool = False


class IntrospectResponse(BaseModel):
    """Backend returns DDL + the @dbml/core import dialect (ADR-0002/0008)."""

    import_dialect: Literal["postgres", "mysql"]
    ddl: str
    table_count: int
