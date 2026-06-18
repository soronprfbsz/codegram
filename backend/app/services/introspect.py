"""DB introspection: connect to an external PostgreSQL/MariaDB, reflect its
schema, and emit DDL the frontend converts to DBML via @dbml/core (ADR-0008).
Credentials are used once and never persisted. Reflection is a SYNC SQLAlchemy
API; the route runs introspect_to_ddl in a threadpool.
"""
import logging
import os
import ssl as ssl_module
from dataclasses import dataclass

from sqlalchemy import MetaData, create_engine
from sqlalchemy.engine import URL
from sqlalchemy.engine.interfaces import Dialect
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.schema import CreateIndex, CreateTable

from app.schemas.introspect import IntrospectRequest

logger = logging.getLogger(__name__)

_DRIVERNAME = {
    "postgresql": "postgresql+psycopg2",
    "mariadb": "mysql+pymysql",
}
_IMPORT_DIALECT = {"postgresql": "postgres", "mariadb": "mysql"}

# Hosts that mean "this machine". Inside a container they resolve to the
# CONTAINER, not the host running it — so a user who types one of these to
# reach a DB on their host can never connect (ADR-0008 runs the backend in a
# container). When we detect a container AND can find the host gateway, we
# rewrite these to the gateway so the natural input "just works".
_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _in_container() -> bool:
    """True when running inside a Docker container (the standard marker file)."""
    return os.path.exists("/.dockerenv")


def _parse_default_gateway(route_table: str) -> str | None:
    """Extract the default-route gateway IPv4 from /proc/net/route contents.

    Each data row is whitespace-separated; the default route has Destination
    `00000000`, and the Gateway field is a little-endian hex IPv4 (e.g.
    `010018AC` → 172.24.0.1). Returns None if there is no usable default route.
    """
    for line in route_table.splitlines()[1:]:  # skip the header row
        fields = line.split()
        if len(fields) < 3:
            continue
        destination, gateway_hex = fields[1], fields[2]
        if destination != "00000000" or len(gateway_hex) != 8:
            continue
        try:
            octets = [int(gateway_hex[i : i + 2], 16) for i in (6, 4, 2, 0)]
        except ValueError:
            continue
        if all(o == 0 for o in octets):  # 0.0.0.0 = no real gateway
            continue
        return ".".join(str(o) for o in octets)
    return None


def _default_gateway() -> str | None:
    """The container's default-route gateway IP (the host on a bridge net)."""
    try:
        with open("/proc/net/route", encoding="ascii") as fh:
            return _parse_default_gateway(fh.read())
    except OSError:
        return None


def rewrite_loopback_host(host: str, in_container: bool, gateway: str | None) -> str:
    """Map a loopback host to the host gateway when running in a container.

    Pure: the environment is passed in (in_container / gateway) so callers
    decide policy and tests stay deterministic. Non-loopback hosts, host
    (non-container) runs, and an unknown gateway all pass through unchanged
    (safe fallback — never worse than the original behavior).
    """
    if in_container and gateway and host.strip().lower() in _LOOPBACK_HOSTS:
        return gateway
    return host


def build_connection_url(
    req: IntrospectRequest,
) -> tuple[URL, dict, str]:
    """(SQLAlchemy URL, connect_args, @dbml/core import dialect) for a request.

    URL.create URL-encodes the password, so special characters are safe.

    A loopback host is rewritten to the container's host gateway when we run
    in a container (see _LOOPBACK_HOSTS) so a user targeting a DB on their
    host machine can connect with the natural "localhost" input.
    """
    host = rewrite_loopback_host(req.host, _in_container(), _default_gateway())
    if host != req.host:
        logger.info("introspect: rewrote loopback host %r -> %r (container)", req.host, host)
    url = URL.create(
        _DRIVERNAME[req.dialect],
        username=req.username,
        password=req.password,
        host=host,
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


class IntrospectError(Exception):
    """Base for introspection failures surfaced to the user."""


class ConnectionFailedError(IntrospectError):
    """Could not connect to / read from the target database."""


class NoTablesFoundError(IntrospectError):
    """The target schema/database has no tables to import."""


@dataclass
class IntrospectResult:
    import_dialect: str
    ddl: str
    table_count: int


def introspect_to_ddl(req: IntrospectRequest) -> IntrospectResult:
    """Connect, reflect the target schema, and emit DDL. SYNC — run in a
    threadpool from the async route. Always disposes the engine."""
    url, connect_args, import_dialect = build_connection_url(req)
    engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True)
    try:
        metadata = MetaData()
        try:
            with engine.connect() as conn:
                metadata.reflect(bind=conn, schema=effective_schema(req))
        except OperationalError as exc:
            raise ConnectionFailedError(
                "데이터베이스에 접속할 수 없습니다. 접속 정보를 확인하세요."
            ) from exc
        except SQLAlchemyError as exc:
            raise ConnectionFailedError(
                "스키마를 읽는 중 오류가 발생했습니다."
            ) from exc
        if not metadata.tables:
            raise NoTablesFoundError("대상 schema에서 테이블을 찾지 못했습니다.")
        return IntrospectResult(
            import_dialect=import_dialect,
            ddl=build_ddl(metadata, engine.dialect),
            table_count=len(metadata.tables),
        )
    finally:
        engine.dispose()
