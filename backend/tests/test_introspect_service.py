"""Unit tests for the pure introspection helpers (no live DB)."""
from app.schemas.introspect import IntrospectRequest
from app.services.introspect import (
    build_connection_url,
    effective_schema,
)


def _req(**over):
    base = dict(
        dialect="postgresql",
        host="db.example.com",
        port=5432,
        username="u",
        password="p@ss/word",
        database="app",
    )
    base.update(over)
    return IntrospectRequest(**base)


def test_postgres_url_and_import_dialect():
    url, connect_args, import_dialect = build_connection_url(_req())
    assert url.drivername == "postgresql+psycopg2"
    assert url.host == "db.example.com"
    assert url.port == 5432
    assert url.database == "app"
    assert import_dialect == "postgres"
    assert connect_args == {}


def test_mariadb_url_and_import_dialect():
    url, _connect_args, import_dialect = build_connection_url(
        _req(dialect="mariadb", port=3306)
    )
    assert url.drivername == "mysql+pymysql"
    assert import_dialect == "mysql"


def test_ssl_connect_args_per_dialect():
    import ssl as ssl_module

    _u, pg_args, _i = build_connection_url(_req(ssl=True))
    assert pg_args == {"sslmode": "require"}
    _u2, my_args, _i2 = build_connection_url(_req(dialect="mariadb", ssl=True))
    assert isinstance(my_args["ssl"], ssl_module.SSLContext)
    assert my_args["ssl"].verify_mode == ssl_module.CERT_NONE


def test_postgres_password_is_url_encoded():
    url, _a, _i = build_connection_url(_req())
    assert "p%40ss%2Fword" in url.render_as_string(hide_password=False)


def test_effective_schema():
    assert effective_schema(_req()) == "public"
    assert effective_schema(_req(db_schema="sales")) == "sales"
    assert effective_schema(_req(dialect="mariadb")) is None


from sqlalchemy import create_engine, text, MetaData
from sqlalchemy.dialects import postgresql, mysql
from app.services.introspect import build_ddl


def _reflect_sqlite() -> MetaData:
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE users ("
            " id INTEGER PRIMARY KEY,"
            " email TEXT NOT NULL UNIQUE)"
        ))
        conn.execute(text(
            "CREATE TABLE posts ("
            " id INTEGER PRIMARY KEY,"
            " user_id INTEGER NOT NULL REFERENCES users(id),"
            " title TEXT)"
        ))
        conn.execute(text("CREATE INDEX ix_posts_title ON posts (title)"))
    md = MetaData()
    md.reflect(bind=engine)
    engine.dispose()
    return md


def test_build_ddl_postgres_covers_tables_fk_index():
    ddl = build_ddl(_reflect_sqlite(), postgresql.dialect())
    assert "CREATE TABLE users" in ddl
    assert "CREATE TABLE posts" in ddl
    assert "PRIMARY KEY" in ddl
    assert "FOREIGN KEY" in ddl
    assert "REFERENCES users" in ddl
    assert "CREATE INDEX ix_posts_title" in ddl
    # statements are terminated so @dbml/core can tokenize them
    assert ddl.count(";") >= 3


def test_build_ddl_mysql_dialect_parameterized():
    ddl = build_ddl(_reflect_sqlite(), mysql.dialect())
    assert "CREATE TABLE" in ddl
    assert "posts" in ddl
    assert "PRIMARY KEY" in ddl
    assert "FOREIGN KEY" in ddl


from app.services.introspect import (
    ConnectionFailedError,
    NoTablesFoundError,
    IntrospectResult,
    introspect_to_ddl,
)


def test_orchestrator_and_errors_importable():
    assert issubclass(ConnectionFailedError, Exception)
    assert issubclass(NoTablesFoundError, Exception)
    assert callable(introspect_to_ddl)
    r = IntrospectResult(import_dialect="postgres", ddl="x;", table_count=1)
    assert r.import_dialect == "postgres" and r.table_count == 1


# --- loopback host rewrite (container → host gateway) ----------------------
# Inside a Docker container, `localhost` means the container itself, so a
# user targeting a DB on the host (the natural thing to type) can never
# connect. When we run in a container and can find the host gateway, rewrite
# loopback hosts to it. On the host (no /.dockerenv) nothing is rewritten.
from app.services.introspect import (
    rewrite_loopback_host,
    _parse_default_gateway,
    build_connection_url as _build_url,
)


def test_rewrite_loopback_host_in_container_uses_gateway():
    for h in ("localhost", "127.0.0.1", "::1"):
        assert rewrite_loopback_host(h, in_container=True, gateway="172.24.0.1") == "172.24.0.1"


def test_rewrite_loopback_host_case_insensitive_and_trimmed():
    assert rewrite_loopback_host(" LocalHost ", in_container=True, gateway="10.0.0.1") == "10.0.0.1"


def test_rewrite_loopback_host_not_in_container_unchanged():
    assert rewrite_loopback_host("localhost", in_container=False, gateway="172.24.0.1") == "localhost"


def test_rewrite_loopback_host_non_loopback_unchanged():
    assert rewrite_loopback_host("db.example.com", in_container=True, gateway="172.24.0.1") == "db.example.com"


def test_rewrite_loopback_host_no_gateway_unchanged():
    # Cannot determine the gateway → keep the input (safe fallback, no worse).
    assert rewrite_loopback_host("localhost", in_container=True, gateway=None) == "localhost"


def test_parse_default_gateway_extracts_ip():
    # /proc/net/route: Destination 00000000 = default; Gateway is hex,
    # little-endian. 0x0118A8C0 -> 192.168.24.1; here 0118... = 1.24.168.192
    # reversed => 192.168.24.1. Use a real WSL2-style row: gw 172.24.0.1.
    # 172.24.0.1 -> bytes C0=.. compute: 172=AC,24=18,0=00,1=01 little-endian
    # so hex field = 010018AC.
    table = (
        "Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask\tMTU\tWindow\tIRTT\n"
        "eth0\t00000000\t010018AC\t0003\t0\t0\t0\t00000000\t0\t0\t0\n"
        "eth0\t000018AC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0\n"
    )
    assert _parse_default_gateway(table) == "172.24.0.1"


def test_parse_default_gateway_none_when_no_default_route():
    table = (
        "Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask\tMTU\tWindow\tIRTT\n"
        "eth0\t000018AC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0\n"
    )
    assert _parse_default_gateway(table) is None


def test_build_connection_url_rewrites_localhost_in_container(monkeypatch):
    import app.services.introspect as svc

    monkeypatch.setattr(svc, "_in_container", lambda: True)
    monkeypatch.setattr(svc, "_default_gateway", lambda: "172.24.0.1")
    url, _args, _i = _build_url(_req(host="localhost"))
    assert url.host == "172.24.0.1"


def test_build_connection_url_keeps_host_outside_container(monkeypatch):
    import app.services.introspect as svc

    monkeypatch.setattr(svc, "_in_container", lambda: False)
    monkeypatch.setattr(svc, "_default_gateway", lambda: "172.24.0.1")
    url, _args, _i = _build_url(_req(host="localhost"))
    assert url.host == "localhost"
