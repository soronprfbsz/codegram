"""Unit tests for the pure introspection helpers (no live DB)."""
from app.schemas.introspect import IntrospectRequest
from app.services.introspect import (
    build_connection_url,
    reflect_schemas,
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


def test_reflect_schemas_postgres_and_mariadb():
    from app.services.introspect import reflect_schemas
    assert reflect_schemas(_req()) == ["public"]
    assert reflect_schemas(_req(db_schemas=[])) == ["public"]
    assert reflect_schemas(_req(db_schemas=["public", "sales"])) == ["public", "sales"]
    assert reflect_schemas(_req(dialect="mariadb")) == [None]


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


def _metadata_with_comments() -> MetaData:
    """A table carrying a table comment and a column comment (like reflected
    Postgres COMMENT ON metadata)."""
    from sqlalchemy import Column, Integer, Table, Text

    md = MetaData()
    Table(
        "users",
        md,
        Column("id", Integer, primary_key=True),
        Column("email", Text, nullable=False, comment="이메일's 코멘트"),
        comment="유저 테이블 코멘트",
        schema="public",
    )
    return md


def test_build_ddl_postgres_emits_comment_on_statements():
    """Postgres comments are separate COMMENT ON statements (not inline), so
    build_ddl must emit them or @dbml/core loses the table/column notes."""
    ddl = build_ddl(_metadata_with_comments(), postgresql.dialect())
    assert "COMMENT ON TABLE public.users IS '유저 테이블 코멘트'" in ddl
    assert "COMMENT ON COLUMN public.users.email IS" in ddl
    # Single-quoted literal with the apostrophe doubled (what @dbml/core parses).
    assert "'이메일''s 코멘트'" in ddl
    # COMMENT ON follows the CREATE TABLE it annotates.
    assert ddl.index("CREATE TABLE") < ddl.index("COMMENT ON TABLE")


def test_build_ddl_mysql_does_not_emit_comment_on():
    """MySQL renders comments inline in CREATE TABLE; COMMENT ON is postgres-only
    syntax and must not be emitted for the mysql dialect."""
    ddl = build_ddl(_metadata_with_comments(), mysql.dialect())
    assert "COMMENT ON" not in ddl


def test_build_ddl_postgres_omits_comment_on_when_no_comments():
    """No reflected comments → no COMMENT ON noise."""
    ddl = build_ddl(_reflect_sqlite(), postgresql.dialect())
    assert "COMMENT ON" not in ddl


def _metadata_with_named_enum() -> MetaData:
    """A table with a NAMED enum column, like a reflected Postgres enum."""
    from sqlalchemy import BigInteger, Column, Enum, Table

    md = MetaData()
    Table(
        "failed_auth_attempts",
        md,
        Column("attempt_id", BigInteger, primary_key=True),
        Column(
            "failure_reason",
            Enum("bad_password", "user_not_found", name="failure_reason_t"),
        ),
    )
    return md


def test_build_ddl_emits_create_type_for_named_enum():
    ddl = build_ddl(_metadata_with_named_enum(), postgresql.dialect())
    # The enum type is defined (values preserved) so @dbml/core makes an Enum block.
    assert "CREATE TYPE" in ddl
    assert "failure_reason_t" in ddl
    assert "'bad_password'" in ddl
    assert "'user_not_found'" in ddl
    # CREATE TYPE precedes the CREATE TABLE that references it.
    assert ddl.index("CREATE TYPE") < ddl.index("CREATE TABLE")


def test_build_ddl_escapes_single_quotes_in_enum_values():
    from sqlalchemy import Column, Integer, Enum, Table

    md = MetaData()
    Table(
        "t",
        md,
        Column("id", Integer, primary_key=True),
        Column("label", Enum("it's", "ok", name="label_t")),
    )
    ddl = build_ddl(md, postgresql.dialect())
    assert "'it''s'" in ddl  # single quote doubled for SQL safety


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


# --- unrecognized column types (pgvector 'vector', etc.) -------------------
# SQLAlchemy reflects a column whose DB type it can't map as NullType, which
# has no DDL → CreateTable raises CompileError → the whole import 500s. We
# patch NullType columns to the original DB type name (recovered from
# information_schema) so one exotic column never breaks the import.
from sqlalchemy import Table, Column, Integer
from sqlalchemy.types import NullType
from sqlalchemy.dialects import postgresql as _pg
from app.services.introspect import _RawType, _patch_unknown_types


def test_raw_type_compiles_to_its_name():
    md = MetaData()
    Table("t", md, Column("id", Integer, primary_key=True), Column("emb", _RawType("vector")))
    ddl = build_ddl(md, _pg.dialect())
    assert "emb vector" in ddl.lower() or "emb\tvector" in ddl.lower() or "vector" in ddl


def test_patch_unknown_types_restores_raw_name():
    md = MetaData()
    Table(
        "rag_chunks", md,
        Column("id", Integer, primary_key=True),
        Column("embedding", NullType()),
    )
    patched = _patch_unknown_types(md, {(None, "rag_chunks", "embedding"): "vector"})
    assert "None.rag_chunks.embedding" in patched
    # build_ddl must NOT raise now, and the original type name is preserved.
    ddl = build_ddl(md, _pg.dialect())
    assert "vector" in ddl


def test_build_ddl_qualifies_table_with_schema():
    """A reflected table carrying .schema renders schema-qualified DDL, so
    @dbml/core assigns the right schema and multi-schema keys never collide."""
    md = MetaData()
    Table("orders", md, Column("id", Integer, primary_key=True), schema="sales")
    ddl = build_ddl(md, _pg.dialect())
    assert "sales.orders" in ddl


def test_patch_unknown_types_keys_by_schema():
    """Same table name in two schemas must not cross-map raw types."""
    md = MetaData()
    Table("t", md, Column("id", Integer, primary_key=True),
          Column("c", NullType()), schema="public")
    Table("t", md, Column("id", Integer, primary_key=True),
          Column("c", NullType()), schema="sales")
    _patch_unknown_types(md, {("public", "t", "c"): "vector",
                              ("sales", "t", "c"): "geometry"})
    ddl = build_ddl(md, _pg.dialect())
    assert "vector" in ddl
    assert "geometry" in ddl


def test_patch_unknown_types_generic_fallback_when_name_missing():
    md = MetaData()
    Table(
        "t", md,
        Column("id", Integer, primary_key=True),
        Column("mystery", NullType()),
    )
    _patch_unknown_types(md, {})  # no raw name available
    ddl = build_ddl(md, _pg.dialect())  # must not raise
    assert "TEXT" in ddl.upper()


def test_patch_unknown_types_leaves_known_columns_untouched():
    md = MetaData()
    Table("t", md, Column("id", Integer, primary_key=True), Column("name", Integer))
    patched = _patch_unknown_types(md, {})
    assert patched == []
    ddl = build_ddl(md, _pg.dialect())
    assert "INTEGER" in ddl.upper()


from sqlalchemy import CheckConstraint as _CheckConstraint
from app.services.introspect import _sanitize_check_constraints


def test_sanitize_check_constraints_strips_inner_backticks():
    """MariaDB reflects CHECK clauses with backtick-quoted identifiers; the
    sanitizer must remove those backticks so @dbml/core emits a valid single-
    backtick DBML check expression (instead of unparseable nested backticks)."""
    md = MetaData()
    Table(
        "SMS_EX_TIME_SCHEDULE_MONTHLY",
        md,
        Column("DAY_OF_MONTH", Integer, nullable=False),
        _CheckConstraint("`DAY_OF_MONTH` between 1 and 31", name="CONSTRAINT_1"),
    )

    cleaned = _sanitize_check_constraints(md)
    assert cleaned == ["SMS_EX_TIME_SCHEDULE_MONTHLY.CONSTRAINT_1"]

    checks = [
        c
        for c in md.tables["SMS_EX_TIME_SCHEDULE_MONTHLY"].constraints
        if isinstance(c, _CheckConstraint)
    ]
    assert len(checks) == 1
    text_after = str(checks[0].sqltext)
    assert "`" not in text_after
    assert "DAY_OF_MONTH between 1 and 31" in text_after

    # The CHECK is preserved (not dropped) and emits cleanly in the DDL.
    ddl = build_ddl(md, mysql.dialect())
    assert "DAY_OF_MONTH between 1 and 31" in ddl


def test_sanitize_check_constraints_noop_without_backticks():
    """Postgres-style checks carry no backticks — the sanitizer leaves them be."""
    md = MetaData()
    Table(
        "t",
        md,
        Column("price", Integer, nullable=False),
        _CheckConstraint("price > 0", name="ck_price"),
    )
    assert _sanitize_check_constraints(md) == []


def test_list_schemas_mariadb_returns_empty():
    """MariaDB has no schema concept (the database is the scope) — no connect."""
    from app.services.introspect import list_schemas
    assert list_schemas(_req(dialect="mariadb")) == []


def test_clickhouse_url_and_driver():
    url, connect_args, _ = build_connection_url(
        _req(dialect="clickhouse", port=8123, database="hawkeye")
    )
    assert url.drivername == "clickhouse+http"
    assert url.host == "db.example.com"
    assert url.port == 8123
    assert connect_args == {}


def test_clickhouse_ssl_selects_https_protocol():
    url, _connect_args, _ = build_connection_url(
        _req(dialect="clickhouse", ssl=True)
    )
    assert url.query.get("protocol") == "https"
