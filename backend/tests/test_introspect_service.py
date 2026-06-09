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
