"""DB introspection: connect to an external PostgreSQL/MariaDB, reflect its
schema, and emit DDL the frontend converts to DBML via @dbml/core (ADR-0008).
Credentials are used once and never persisted. Reflection is a SYNC SQLAlchemy
API; the route runs introspect_to_ddl in a threadpool.
"""
from sqlalchemy.engine import URL

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
            connect_args["ssl"] = {}
    return url, connect_args, _IMPORT_DIALECT[req.dialect]


def effective_schema(req: IntrospectRequest) -> str | None:
    """PostgreSQL target namespace (default `public`); MariaDB scope is the
    connected database, so reflection uses schema=None there."""
    if req.dialect == "postgresql":
        return req.db_schema or "public"
    return None
