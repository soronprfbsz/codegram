"""DB introspection: connect to an external PostgreSQL/MariaDB, reflect its
schema, and emit DDL the frontend converts to DBML via @dbml/core (ADR-0008).
Credentials are used once and never persisted. Reflection is a SYNC SQLAlchemy
API; the route runs introspect_to_ddl in a threadpool.
"""
import ssl as ssl_module

from sqlalchemy import MetaData
from sqlalchemy.engine import URL
from sqlalchemy.engine.interfaces import Dialect
from sqlalchemy.schema import CreateIndex, CreateTable

from app.schemas.introspect import IntrospectRequest

_DRIVERNAME = {
    "postgresql": "postgresql+psycopg2",
    "mariadb": "mysql+pymysql",
}
_IMPORT_DIALECT = {"postgresql": "postgres", "mariadb": "mysql"}


def build_connection_url(
    req: IntrospectRequest,
) -> tuple[URL, dict, str]:
    """(SQLAlchemy URL, connect_args, @dbml/core import dialect) for a request.

    URL.create URL-encodes the password, so special characters are safe.
    """
    url = URL.create(
        _DRIVERNAME[req.dialect],
        username=req.username,
        password=req.password,
        host=req.host,
        port=req.port,
        database=req.database,
    )
    connect_args: dict = {}
    if req.ssl:
        if req.dialect == "postgresql":
            connect_args["sslmode"] = "require"
        else:
            # PyMySQL treats an empty dict as falsy and would NOT enable TLS.
            # Pass an SSLContext that encrypts without verifying the server
            # cert — matching the "require" (encrypt, don't verify) level used
            # for postgres above.
            ctx = ssl_module.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl_module.CERT_NONE
            connect_args["ssl"] = ctx
    return url, connect_args, _IMPORT_DIALECT[req.dialect]


def effective_schema(req: IntrospectRequest) -> str | None:
    """PostgreSQL target namespace (default `public`); MariaDB scope is the
    connected database, so reflection uses schema=None there."""
    if req.dialect == "postgresql":
        return req.db_schema or "public"
    return None


def build_ddl(metadata: MetaData, dialect: Dialect) -> str:
    """Emit dialect DDL for every reflected table: CREATE TABLE (PK/FK/UQ/NN
    inline) followed by its secondary indexes. Tables are FK-sorted so the
    output reads top-down; @dbml/core resolves refs regardless of order."""
    parts: list[str] = []
    for table in metadata.sorted_tables:
        parts.append(str(CreateTable(table).compile(dialect=dialect)).strip() + ";")
        for index in sorted(table.indexes, key=lambda i: i.name or ""):
            parts.append(str(CreateIndex(index).compile(dialect=dialect)).strip() + ";")
    return "\n\n".join(parts)
