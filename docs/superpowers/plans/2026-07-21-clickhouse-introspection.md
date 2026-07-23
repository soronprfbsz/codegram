# ClickHouse 연결 타입 추가 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DB 가져오기·동기화에 ClickHouse를 세 번째 연결 타입으로 추가해, 실행 중인 ClickHouse 스키마를 읽어 테이블+컬럼 ERD를 자동 생성한다(관계선 없음).

**Architecture:** ClickHouse는 기존 PG/MariaDB의 reflection→DDL→`@dbml/core` 경로를 타지 않는다. 백엔드가 `system.tables`/`system.columns`를 조회해 **구조화된 테이블·컬럼(JSON)**을 반환하고, 프론트가 타입을 따옴표로 감싼 **DBML 텍스트를 직접 생성**한다(`@dbml/core` importer 우회). 이후 프로젝트 생성·동기화·ERD 렌더는 DBML 텍스트만 소비하므로 그대로 재사용된다. 근거·결정은 ADR-0021, 설계는 `docs/superpowers/specs/2026-07-21-clickhouse-introspection-design.md`.

**Tech Stack:** 백엔드 FastAPI + SQLAlchemy 2.0 + `clickhouse-sqlalchemy`(HTTP dialect, 신규). 프론트 React + Vite + TypeScript + `@dbml/core` 8.2.5.

## Global Constraints

- 백엔드 계층: 라우트 얇게, 로직은 `services`, I/O는 `schemas`(Pydantic). ORM 모델을 응답으로 노출 금지(B1). 스키마 변경 아니므로 Alembic 마이그레이션 없음(접속정보 비저장, ADR-0008).
- 프론트 FSD import 방향: `shared ← entities ← features ← widgets ← pages`. `entities`는 `features`를 import하지 않는다(F3) → 공유 타입은 `entities/dbml`에 둔다.
- 사용자 노출 문자열은 i18n(F4). 단 dialect 옵션 라벨은 고정 브랜드명("PostgreSQL"/"MariaDB")이라 기존과 동일하게 리터럴로 둔다(코드 식별자·브랜드명은 F4 예외).
- 시각 스타일은 디자인 토큰만(F5). 이 작업은 새 스타일을 도입하지 않는다(기존 `inputClass`·`<option>` 패턴 재사용).
- 외과적 변경(G2): `DbConnectDialog`의 native `<select>`는 그대로 두고 옵션 한 줄만 추가한다(shadcn 마이그레이션은 이 작업 범위 밖).
- DBML 불변식(실측): **Table은 컬럼이 최소 1개** 있어야 파싱된다(코드 3018) → 컬럼 0개 테이블은 스킵. 복합 타입은 따옴표로 감싸면 원문 보존, 식별자 내 `"`는 `\"`로, note 내 `'`는 `\'`로 이스케이프(실측 확인).
- 접속정보는 1회용·비저장(ADR-0008 유지).
- 검증 명령은 codegram 도커 스택이 떠 있어야 동작한다(`deploy/scripts/start.sh`; 백엔드 4000·프론트 4001·pg 35432). ClickHouse 실 인스턴스: `clickhouse.example.test:8123`, user `hawkeye` / pw `<CH_PASSWORD>` / database `hawkeye`.

---

### Task 1: 백엔드 — 요청 스키마 + 접속 URL에 clickhouse 추가

**Files:**
- Modify: `backend/pyproject.toml:10-23` (dependencies)
- Modify: `backend/app/schemas/introspect.py:15` (dialect Literal)
- Modify: `backend/app/services/introspect.py:24-28` (`_DRIVERNAME`/`_IMPORT_DIALECT`), `:112-123` (SSL 분기)
- Test: `backend/tests/test_introspect_service.py`

**Interfaces:**
- Consumes: 기존 `build_connection_url(req) -> (URL, dict, str)`.
- Produces: `IntrospectRequest.dialect`가 `"clickhouse"`를 허용. clickhouse 요청에 대해 `build_connection_url`이 drivername `clickhouse+http`, ssl 시 URL query `protocol=https`를 반환.

- [ ] **Step 1: 실패하는 테스트 작성** — `backend/tests/test_introspect_service.py` 끝에 추가

```python
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
```

- [ ] **Step 2: 실패 확인**

Run: `docker compose -p codegram exec -T backend pytest -q tests/test_introspect_service.py -k clickhouse`
Expected: FAIL — `IntrospectRequest` dialect Literal이 `clickhouse`를 거부(pydantic ValidationError) 또는 `_DRIVERNAME` KeyError.

- [ ] **Step 3: 의존성 추가** — `backend/pyproject.toml`의 `dependencies` 배열에 `PyMySQL==1.1.1` 다음 줄로 추가

```toml
    "clickhouse-sqlalchemy==0.3.2",
```

- [ ] **Step 4: dialect Literal 확장** — `backend/app/schemas/introspect.py:15`

```python
    dialect: Literal["postgresql", "mariadb", "clickhouse"]
```

- [ ] **Step 5: 드라이버·import-dialect 매핑 확장** — `backend/app/services/introspect.py:24-28`

```python
_DRIVERNAME = {
    "postgresql": "postgresql+psycopg2",
    "mariadb": "mysql+pymysql",
    "clickhouse": "clickhouse+http",
}
# ClickHouse는 @dbml/core importer를 쓰지 않아 import dialect가 없다(빈 문자열).
_IMPORT_DIALECT = {"postgresql": "postgres", "mariadb": "mysql", "clickhouse": ""}
```

- [ ] **Step 6: SSL 분기 추가** — `backend/app/services/introspect.py`의 `build_connection_url` 내 `if req.ssl:` 블록(현재 :112-123)을 아래로 교체

```python
    connect_args: dict = {}
    if req.ssl:
        if req.dialect == "postgresql":
            connect_args["sslmode"] = "require"
        elif req.dialect == "clickhouse":
            # clickhouse+http over TLS: select the https protocol via URL query.
            # Best-effort — the primary target is plaintext 8123; verify against
            # a TLS-enabled ClickHouse if that path is exercised.
            url = url.update_query_dict({"protocol": "https"})
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
```

- [ ] **Step 7: 통과 확인**

Run: `docker compose -p codegram exec -T backend pytest -q tests/test_introspect_service.py -k clickhouse`
Expected: PASS (2 passed). 의존성 미설치로 import 단계에서 막히면 스택 재빌드: `docker compose -p codegram build backend && docker compose -p codegram up -d backend`.

- [ ] **Step 8: 커밋**

```bash
git add backend/pyproject.toml backend/app/schemas/introspect.py backend/app/services/introspect.py backend/tests/test_introspect_service.py
git commit -m "feat(backend): clickhouse dialect — driver + connection URL"
```

---

### Task 2: 백엔드 — 응답 DTO + 순수 테이블 조립 함수

**Files:**
- Modify: `backend/app/schemas/introspect.py` (신규 `IntrospectedColumn`/`IntrospectedTable`, `IntrospectResponse` 확장)
- Modify: `backend/app/services/introspect.py` (신규 `_assemble_clickhouse_tables`, `IntrospectResult` 확장)
- Test: `backend/tests/test_introspect_service.py`

**Interfaces:**
- Produces:
  - `IntrospectedColumn{ name: str, type: str, comment: str | None }`, `IntrospectedTable{ name: str, engine: str | None, columns: list[IntrospectedColumn] }` (Pydantic, in schemas).
  - `_assemble_clickhouse_tables(table_rows: list[tuple[str, str]], column_rows: list[tuple[str, str, str, str]]) -> list[IntrospectedTable]` — 순수. `table_rows`는 (name, engine), `column_rows`는 (table, name, type, comment)이며 이미 (table, position) 순으로 정렬돼 있다고 가정.
  - `IntrospectResult`에 `tables: list[IntrospectedTable] | None` 필드 추가, `import_dialect`/`ddl`은 optional화.

- [ ] **Step 1: 실패하는 테스트 작성** — `backend/tests/test_introspect_service.py`에 추가(상단 import에 `_assemble_clickhouse_tables` 추가)

```python
def test_assemble_clickhouse_groups_columns_in_order():
    from app.services.introspect import _assemble_clickhouse_tables

    tables = _assemble_clickhouse_tables(
        table_rows=[("events", "MergeTree"), ("empty", "")],
        column_rows=[
            ("events", "org_id", "LowCardinality(String)", ""),
            ("events", "msg", "String", "the message"),
        ],
    )
    assert [t.name for t in tables] == ["events", "empty"]
    assert tables[0].engine == "MergeTree"
    assert tables[1].engine is None            # "" -> None
    assert [c.name for c in tables[0].columns] == ["org_id", "msg"]
    assert tables[0].columns[0].comment is None  # "" -> None
    assert tables[0].columns[1].comment == "the message"
    assert tables[1].columns == []
```

- [ ] **Step 2: 실패 확인**

Run: `docker compose -p codegram exec -T backend pytest -q tests/test_introspect_service.py -k assemble_clickhouse`
Expected: FAIL — `_assemble_clickhouse_tables`, `IntrospectedTable` 미정의(ImportError).

- [ ] **Step 3: 응답 DTO 추가** — `backend/app/schemas/introspect.py`의 `IntrospectResponse`(현재 :29-34)를 아래로 교체

```python
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
```

- [ ] **Step 4: 서비스 import + IntrospectResult 확장** — `backend/app/services/introspect.py`

`:20`의 import 교체:
```python
from app.schemas.introspect import (
    IntrospectedColumn,
    IntrospectedTable,
    IntrospectRequest,
)
```

`IntrospectResult` 데이터클래스(현재 :287-291) 교체(키워드 생성이므로 필드 순서 변경 안전):
```python
@dataclass
class IntrospectResult:
    table_count: int
    import_dialect: str | None = None
    ddl: str | None = None
    tables: list[IntrospectedTable] | None = None
```

- [ ] **Step 5: 순수 조립 함수 추가** — `backend/app/services/introspect.py`의 `list_schemas` 정의 바로 위에 추가

```python
def _assemble_clickhouse_tables(
    table_rows: list[tuple[str, str]],
    column_rows: list[tuple[str, str, str, str]],
) -> list[IntrospectedTable]:
    """Group already position-ordered columns under their tables. Pure — the
    SQL (system.tables/system.columns) is issued by the caller so this stays
    testable. Empty engine/comment strings normalize to None."""
    cols_by_table: dict[str, list[IntrospectedColumn]] = {}
    for table, name, type_, comment in column_rows:
        cols_by_table.setdefault(table, []).append(
            IntrospectedColumn(name=name, type=type_, comment=comment or None)
        )
    return [
        IntrospectedTable(
            name=name,
            engine=engine or None,
            columns=cols_by_table.get(name, []),
        )
        for name, engine in table_rows
    ]
```

- [ ] **Step 6: 통과 확인**

Run: `docker compose -p codegram exec -T backend pytest -q tests/test_introspect_service.py -k assemble_clickhouse`
Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
git add backend/app/schemas/introspect.py backend/app/services/introspect.py backend/tests/test_introspect_service.py
git commit -m "feat(backend): structured introspect DTOs + clickhouse table assembly"
```

---

### Task 3: 백엔드 — `introspect_clickhouse` + 디스패치 + 라우트 응답

**Files:**
- Modify: `backend/app/services/introspect.py` (신규 `introspect_clickhouse`, `introspect_to_ddl` 상단 디스패치)
- Modify: `backend/app/api/routes/introspect.py:46-50` (응답에 `tables` 전달)
- Test: `backend/tests/test_introspect_routes.py`

**Interfaces:**
- Consumes: `build_connection_url`, `_assemble_clickhouse_tables`, `IntrospectResult`, `ConnectionFailedError`, `NoTablesFoundError`.
- Produces: `introspect_clickhouse(req) -> IntrospectResult` (tables 채움). `introspect_to_ddl(req)`가 clickhouse면 이를 위임. 라우트 `POST /api/introspect`가 `tables`를 응답에 실어 보냄.

- [ ] **Step 1: 실패하는 테스트 작성** — `backend/tests/test_introspect_routes.py`에 추가. 기존 파일의 인증·클라이언트 픽스처 패턴을 그대로 쓰고, 서비스 계층을 monkeypatch한다.

```python
def test_introspect_clickhouse_returns_tables(client, auth_headers, monkeypatch):
    from app.schemas.introspect import IntrospectedColumn, IntrospectedTable
    from app.services.introspect import IntrospectResult
    import app.api.routes.introspect as route

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

    monkeypatch.setattr(route, "introspect_to_ddl", fake)
    resp = client.post(
        "/api/introspect",
        headers=auth_headers,
        json={
            "dialect": "clickhouse",
            "host": "clickhouse.example.test",
            "port": 8123,
            "username": "hawkeye",
            "password": "x",
            "database": "hawkeye",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ddl"] is None
    assert body["table_count"] == 1
    assert body["tables"][0]["name"] == "events"
    assert body["tables"][0]["engine"] == "MergeTree"
    assert body["tables"][0]["columns"][0]["type"] == "LowCardinality(String)"
```

> 기존 `test_introspect_routes.py`의 `client`/`auth_headers` 픽스처 이름이 다르면 그 파일의 실제 픽스처·헬퍼(로그인 토큰 발급)를 그대로 사용해 맞춘다. monkeypatch 대상은 라우트 모듈이 import한 심볼(`app.api.routes.introspect.introspect_to_ddl`)이다.

- [ ] **Step 2: 실패 확인**

Run: `docker compose -p codegram exec -T backend pytest -q tests/test_introspect_routes.py -k clickhouse`
Expected: FAIL — 응답에 `tables` 키가 없음(라우트가 아직 전달 안 함).

- [ ] **Step 3: `introspect_clickhouse` 추가** — `backend/app/services/introspect.py`의 `introspect_to_ddl` 정의 바로 위에 추가

```python
_CH_TABLES_SQL = (
    "SELECT name, engine FROM system.tables "
    "WHERE database = :db AND name NOT LIKE '.inner_id.%' "
    "ORDER BY name"
)
_CH_COLUMNS_SQL = (
    "SELECT table, name, type, comment FROM system.columns "
    "WHERE database = :db AND table NOT LIKE '.inner_id.%' "
    "ORDER BY table, position"
)


def introspect_clickhouse(req: IntrospectRequest) -> IntrospectResult:
    """Read ClickHouse tables/columns from system tables into a structured list
    (ADR-0021). Views/materialized views/dictionaries are included; the hidden
    `.inner_id.*` backing tables of materialized views are excluded. There are
    no foreign keys, so no relations. SYNC — run in a threadpool. Always
    disposes the engine."""
    url, connect_args, _ = build_connection_url(req)
    engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True)
    try:
        try:
            with engine.connect() as conn:
                table_rows = [
                    (r.name, r.engine)
                    for r in conn.execute(text(_CH_TABLES_SQL), {"db": req.database})
                ]
                column_rows = [
                    (r.table, r.name, r.type, r.comment)
                    for r in conn.execute(text(_CH_COLUMNS_SQL), {"db": req.database})
                ]
        except OperationalError as exc:
            raise ConnectionFailedError(
                "데이터베이스에 접속할 수 없습니다. 접속 정보를 확인하세요."
            ) from exc
        except SQLAlchemyError as exc:
            raise ConnectionFailedError(
                "스키마를 읽는 중 오류가 발생했습니다."
            ) from exc
        tables = _assemble_clickhouse_tables(table_rows, column_rows)
        if not tables:
            raise NoTablesFoundError("대상 database에서 테이블을 찾지 못했습니다.")
        return IntrospectResult(table_count=len(tables), tables=tables)
    finally:
        engine.dispose()
```

- [ ] **Step 4: 디스패치 추가** — `backend/app/services/introspect.py`의 `introspect_to_ddl` 본문 첫 줄(docstring 다음)에 추가

```python
def introspect_to_ddl(req: IntrospectRequest) -> IntrospectResult:
    """Connect, reflect the target schema, and emit DDL. SYNC — run in a
    threadpool from the async route. Always disposes the engine.
    ClickHouse is delegated to introspect_clickhouse (structured, ADR-0021)."""
    if req.dialect == "clickhouse":
        return introspect_clickhouse(req)
    url, connect_args, import_dialect = build_connection_url(req)
    # ...기존 본문 그대로...
```

- [ ] **Step 5: 라우트 응답에 tables 전달** — `backend/app/api/routes/introspect.py:46-50` 교체

```python
    return IntrospectResponse(
        import_dialect=result.import_dialect,
        ddl=result.ddl,
        tables=result.tables,
        table_count=result.table_count,
    )
```

- [ ] **Step 6: 통과 확인 + 회귀 없음**

Run: `docker compose -p codegram exec -T backend pytest -q tests/test_introspect_routes.py tests/test_introspect_service.py tests/test_introspect_schemas.py`
Expected: 전부 PASS(기존 PG/MariaDB 라우트 테스트 포함 — `ddl`/`import_dialect` 경로 불변).

- [ ] **Step 7: 커밋**

```bash
git add backend/app/services/introspect.py backend/app/api/routes/introspect.py backend/tests/test_introspect_routes.py
git commit -m "feat(backend): introspect_clickhouse + route dispatch/response"
```

---

### Task 4: 프론트 — introspect DTO 타입 (entities + features)

**Files:**
- Create: `frontend/src/entities/dbml/model/introspect.ts`
- Modify: `frontend/src/entities/dbml/index.ts` (신규 타입 export)
- Modify: `frontend/src/features/db-import/model/types.ts` (dialect union + response `tables`)

**Interfaces:**
- Produces (entities/dbml): `IntrospectedColumn{ name: string; type: string; comment: string | null }`, `IntrospectedTable{ name: string; engine: string | null; columns: IntrospectedColumn[] }`.
- Produces (features): `IntrospectDialect = 'postgresql' | 'mariadb' | 'clickhouse'`; `IntrospectResponse`에 `tables?: IntrospectedTable[]`, `import_dialect?`/`ddl?` optional화.

> FSD상 `entities`는 `features`를 import할 수 없고 `buildDbmlFromTables`(Task 5)가 이 타입을 쓰므로, 타입의 단일 출처는 `entities/dbml`이며 `features`가 그것을 소비한다.

- [ ] **Step 1: entities에 타입 생성** — `frontend/src/entities/dbml/model/introspect.ts`

```ts
/** Structured introspection result for dialects without a DDL path (ClickHouse,
 *  ADR-0021). Mirrors backend IntrospectedTable/IntrospectedColumn. Lives in
 *  entities/dbml because buildDbmlFromTables consumes it (FSD: features → entities). */
export interface IntrospectedColumn {
  name: string
  type: string
  comment: string | null
}

export interface IntrospectedTable {
  name: string
  engine: string | null
  columns: IntrospectedColumn[]
}
```

- [ ] **Step 2: entities index에서 export** — `frontend/src/entities/dbml/index.ts` 끝에 추가

```ts
export type { IntrospectedColumn, IntrospectedTable } from './model/introspect'
```

- [ ] **Step 3: features 타입 갱신** — `frontend/src/features/db-import/model/types.ts` 전체 교체

```ts
/** DB-import DTOs mirroring backend app/schemas/introspect.py. */
import type { IntrospectedTable } from '@/entities/dbml'

export type IntrospectDialect = 'postgresql' | 'mariadb' | 'clickhouse'

/** Matches backend IntrospectRequest. */
export interface IntrospectRequest {
  dialect: IntrospectDialect
  host: string
  port: number
  username: string
  password: string
  database: string
  db_schemas?: string[]
  ssl: boolean
}

/** Matches backend IntrospectResponse. PostgreSQL/MariaDB return ddl +
 *  import_dialect; ClickHouse returns structured tables instead (ADR-0021). */
export interface IntrospectResponse {
  import_dialect?: 'postgres' | 'mysql'
  ddl?: string
  tables?: IntrospectedTable[]
  table_count: number
}

/** Matches backend SchemaListResponse. */
export interface SchemaListResponse {
  schemas: string[]
}
```

- [ ] **Step 4: 타입 체크**

Run: `cd frontend && npm run type-check`
Expected: PASS. (`DbConnectDialog.tsx:127`이 `response.ddl`/`import_dialect`를 non-optional로 쓰던 곳이 optional이 되어 에러가 나면 Task 6에서 정리되지만, 여기서 막히면 Task 6의 handleConnect 교체를 함께 적용해도 된다.)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/entities/dbml/model/introspect.ts frontend/src/entities/dbml/index.ts frontend/src/features/db-import/model/types.ts
git commit -m "feat(frontend): structured introspect DTO types (entities/dbml)"
```

---

### Task 5: 프론트 — `buildDbmlFromTables` (순수 함수, 왕복 파싱 검증)

**Files:**
- Create: `frontend/src/entities/dbml/lib/buildDbmlFromTables.ts`
- Create: `frontend/src/entities/dbml/lib/buildDbmlFromTables.test.ts`
- Modify: `frontend/src/entities/dbml/index.ts` (export)

**Interfaces:**
- Consumes: `IntrospectedTable`(Task 4), `SqlImportResult`(기존 `entities/dbml/model/sqlTypes`).
- Produces: `buildDbmlFromTables(tables: IntrospectedTable[]): SqlImportResult` — 순수, never-throw. 컬럼 0개 테이블은 스킵. 남은 테이블이 없으면 `{ ok: false, errors }`.

- [ ] **Step 1: 실패하는 테스트 작성** — `frontend/src/entities/dbml/lib/buildDbmlFromTables.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { Parser } from '@dbml/core'
import { buildDbmlFromTables } from './buildDbmlFromTables'

describe('buildDbmlFromTables', () => {
  it('preserves complex ClickHouse types via quoting (round-trips through @dbml/core)', () => {
    const res = buildDbmlFromTables([
      {
        name: 'events',
        engine: 'MergeTree',
        columns: [
          { name: 'org_id', type: 'LowCardinality(String)', comment: null },
          { name: 'data_class', type: "Enum8('operational' = 1, 'regulated' = 2)", comment: 'sensitivity' },
          { name: 'tags', type: 'Map(LowCardinality(String), String)', comment: null },
        ],
      },
    ])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const db = new Parser().parse(res.dbml, 'dbmlv2')
    const t = db.schemas[0].tables[0]
    expect(t.fields.map((f: { type: { type_name: string } }) => f.type.type_name)).toEqual([
      'LowCardinality(String)',
      "Enum8('operational' = 1, 'regulated' = 2)",
      'Map(LowCardinality(String), String)',
    ])
    expect(t.fields[1].note).toBe('sensitivity')
    expect(res.dbml).toContain("Note: 'MergeTree'")
  })

  it('skips zero-column tables (DBML requires >=1 column)', () => {
    const res = buildDbmlFromTables([
      { name: 'ok', engine: null, columns: [{ name: 'id', type: 'UUID', comment: null }] },
      { name: 'empty', engine: 'View', columns: [] },
    ])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.dbml).toContain('Table "ok"')
    expect(res.dbml).not.toContain('Table "empty"')
    // still valid DBML
    expect(() => new Parser().parse(res.dbml, 'dbmlv2')).not.toThrow()
  })

  it('returns an error when no table has columns', () => {
    const res = buildDbmlFromTables([{ name: 'empty', engine: null, columns: [] }])
    expect(res.ok).toBe(false)
  })

  it('escapes double quotes in identifiers and single quotes in notes', () => {
    const res = buildDbmlFromTables([
      { name: 'weird', engine: null, columns: [{ name: 'a"b', type: 'String', comment: "it's" }] },
    ])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const db = new Parser().parse(res.dbml, 'dbmlv2')
    const t = db.schemas[0].tables[0]
    expect(t.fields[0].name).toBe('a"b')
    expect(t.fields[0].note).toBe("it's")
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/entities/dbml/lib/buildDbmlFromTables.test.ts`
Expected: FAIL — 모듈 미존재.

- [ ] **Step 3: 구현** — `frontend/src/entities/dbml/lib/buildDbmlFromTables.ts`

```ts
import type { SqlImportResult } from '../model/sqlTypes'
import type { IntrospectedTable } from '../model/introspect'

/** Quote a DBML identifier/type, backslash-escaping inner double quotes. */
function q(s: string): string {
  return '"' + s.replace(/"/g, '\\"') + '"'
}

/** A single-quoted DBML string literal, backslash-escaping inner apostrophes. */
function noteLiteral(s: string): string {
  return "'" + s.replace(/'/g, "\\'") + "'"
}

/**
 * Build DBML text (tables + columns only, NO relations) from an introspected
 * table list. Used for dialects with no DDL path — ClickHouse (ADR-0021).
 *
 * Types are quoted so complex ClickHouse types (LowCardinality, Enum8, Map,
 * AggregateFunction, …) survive @dbml/core parsing verbatim. A DBML Table must
 * have >=1 column, so zero-column tables are skipped. Column comments become
 * `[note: '...']`; the table engine becomes a table `Note`. Pure; never throws.
 * entities layer, alongside the other @dbml/core-adjacent code (ADR-0002:
 * DBML generation stays in the frontend).
 */
export function buildDbmlFromTables(tables: IntrospectedTable[]): SqlImportResult {
  const blocks = tables
    .filter((t) => t.columns.length > 0)
    .map((t) => {
      const cols = t.columns.map((c) => {
        const note = c.comment ? ` [note: ${noteLiteral(c.comment)}]` : ''
        return `  ${q(c.name)} ${q(c.type)}${note}`
      })
      const engineNote = t.engine ? `\n  Note: ${noteLiteral(t.engine)}` : ''
      return `Table ${q(t.name)} {\n${cols.join('\n')}${engineNote}\n}`
    })
  if (blocks.length === 0) {
    return { ok: false, errors: [{ message: 'No tables found' }] }
  }
  return { ok: true, dbml: blocks.join('\n\n') }
}
```

- [ ] **Step 4: export 추가** — `frontend/src/entities/dbml/index.ts` 끝에 추가

```ts
export { buildDbmlFromTables } from './lib/buildDbmlFromTables'
```

- [ ] **Step 5: 통과 확인**

Run: `cd frontend && npx vitest run src/entities/dbml/lib/buildDbmlFromTables.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/entities/dbml/lib/buildDbmlFromTables.ts frontend/src/entities/dbml/lib/buildDbmlFromTables.test.ts frontend/src/entities/dbml/index.ts
git commit -m "feat(frontend): buildDbmlFromTables — structured tables -> DBML"
```

---

### Task 6: 프론트 — DbConnectDialog에 ClickHouse 배선

**Files:**
- Modify: `frontend/src/features/db-import/ui/DbConnectDialog.tsx` (import, `DEFAULT_PORT`, `<option>`, `handleConnect` 분기)
- Modify: `frontend/src/features/db-import/ui/DbConnectDialog.test.tsx` (ClickHouse 케이스)

**Interfaces:**
- Consumes: `buildDbmlFromTables`(Task 5), `IntrospectResponse.tables`(Task 4).
- Produces: dialect가 `clickhouse`일 때 스키마 선택 UI 미노출·`db_schemas` 미전달(기존 `postgresql` 게이트로 자동), 응답 `tables`로 DBML 생성 후 `onIntrospected`로 상향.

- [ ] **Step 1: 실패하는 테스트 작성** — `DbConnectDialog.test.tsx`에 케이스 추가(MariaDB 케이스 미러)

```ts
  it('introspects ClickHouse via structured tables and reports DBML up', async () => {
    const user = setup()
    const onIntrospected = vi.fn()
    mutateAsync.mockResolvedValueOnce({
      table_count: 1,
      tables: [
        {
          name: 'events',
          engine: 'MergeTree',
          columns: [
            { name: 'org_id', type: 'LowCardinality(String)', comment: null },
          ],
        },
      ],
    })
    render(
      <DbConnectDialog open onOpenChange={vi.fn()} onIntrospected={onIntrospected} />,
    )
    await user.selectOptions(screen.getByTestId('db-connect-dialect'), 'clickhouse')
    expect(screen.queryByTestId('db-connect-load-schemas')).toBeNull()
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Connect' }))

    expect(mutateAsync.mock.calls[0][0].dialect).toBe('clickhouse')
    expect(mutateAsync.mock.calls[0][0].db_schemas).toBeUndefined()
    expect(onIntrospected).toHaveBeenCalledTimes(1)
    const [dbml] = onIntrospected.mock.calls[0]
    expect(dbml).toContain('Table "events"')
    expect(dbml).toContain('"org_id" "LowCardinality(String)"')
  })
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/features/db-import/ui/DbConnectDialog.test.tsx -t ClickHouse`
Expected: FAIL — `clickhouse` 옵션 없음 / `handleConnect`가 `response.ddl`(undefined)로 `importSqlToDbml` 호출해 변환 실패.

- [ ] **Step 3: import + DEFAULT_PORT** — `DbConnectDialog.tsx`

`:3` import에 `buildDbmlFromTables` 추가:
```ts
import { importSqlToDbml, buildDbmlFromTables, type DbmlParseError } from '@/entities/dbml'
```

`DEFAULT_PORT`(:29-32) 교체:
```ts
const DEFAULT_PORT: Record<IntrospectDialect, number> = {
  postgresql: 5432,
  mariadb: 3306,
  clickhouse: 8123,
}
```

- [ ] **Step 4: 옵션 추가** — `DbConnectDialog.tsx:172`(mariadb 옵션 다음)

```tsx
            <option value="clickhouse">ClickHouse</option>
```

- [ ] **Step 5: handleConnect 분기** — `DbConnectDialog.tsx:127` 교체

```ts
    const result =
      dialect === 'clickhouse'
        ? buildDbmlFromTables(response.tables ?? [])
        : importSqlToDbml(response.ddl ?? '', response.import_dialect ?? 'postgres')
```

- [ ] **Step 6: 통과 확인 + 회귀 없음**

Run: `cd frontend && npx vitest run src/features/db-import/ui/DbConnectDialog.test.tsx`
Expected: 전 케이스 PASS(기존 PG/MariaDB 케이스 포함).

- [ ] **Step 7: 타입/전체 단위 + 커밋**

```bash
cd frontend && npm run type-check && npm run test:run
```
Expected: PASS.
```bash
git add frontend/src/features/db-import/ui/DbConnectDialog.tsx frontend/src/features/db-import/ui/DbConnectDialog.test.tsx
git commit -m "feat(frontend): wire ClickHouse into DbConnectDialog"
```

---

### Task 7: 도메인 문서(CONTEXT.md) 갱신

**Files:**
- Modify: `CONTEXT.md:69-71` (DB 가져오기 정의)

**Interfaces:** 없음(문서).

- [ ] **Step 1: DB 가져오기 정의 갱신** — `CONTEXT.md`의 "DB 가져오기" 문단(현재 :70)을 아래로 교체(변경점: 대상 DB에 ClickHouse 추가, 산출물이 dialect별이라는 점, ClickHouse는 관계 없는 테이블·컬럼만이며 schema=접속 database)

```markdown
실행 중인 외부 데이터베이스(PostgreSQL·MariaDB·ClickHouse)에 접속해 스키마를 읽어(introspection) 그 구조를 새 Project의 DBML로 옮기는 동작. 접속 정보(호스트·유저·비밀번호)는 **1회용**으로만 쓰이고 저장되지 않는다. 백엔드가 외부 DB에 접속해 스키마를 읽는 방식은 dialect별로 다르다 — PostgreSQL·MariaDB는 reflection으로 **DDL**을 만들고(프론트 `@dbml/core`가 DDL→DBML 변환), ClickHouse는 `system.tables`/`system.columns`를 읽어 **구조화된 테이블·컬럼 목록**을 반환하고 프론트가 그것으로 DBML을 직접 만든다(ADR-0021). 어느 경우든 **DBML 의미는 여전히 프론트에서만 다룬다**(ADR-0002 유지). ClickHouse는 외래키가 없어 **관계 없는 테이블·컬럼만** 옮긴다. 한 번의 가져오기는 한 schema(PG는 기본 `public`, MariaDB·ClickHouse는 접속한 database)를 대상으로 하고 결과는 새 Project 하나가 된다.
```

- [ ] **Step 2: 커밋**

```bash
git add CONTEXT.md
git commit -m "docs(context): DB 가져오기에 ClickHouse 반영 (ADR-0021)"
```

---

### Task 8: 실 인스턴스 검증 (드라이버 스모크 + E2E)

**Files:** 없음(검증). 실패 시 코드/계획으로 되돌아간다.

**Interfaces:** 없음.

- [ ] **Step 1: 스택 기동**

Run: `bash deploy/scripts/start.sh` (또는 프로젝트 README Quickstart)
Expected: backend(:4000)/frontend(:4001)/postgres 기동. `docker compose -p codegram ps`로 확인.

- [ ] **Step 2: 드라이버 스모크(가장 위험한 가정 검증)** — 백엔드 컨테이너에서 clickhouse-sqlalchemy가 HTTP 8123로 실제 접속·조회되는지 확인

```bash
docker compose -p codegram exec -T backend python -c "
from sqlalchemy import create_engine, text
e = create_engine('clickhouse+http://hawkeye:<CH_PASSWORD>@clickhouse.example.test:8123/hawkeye')
with e.connect() as c:
    n = c.execute(text(\"SELECT count() FROM system.tables WHERE database='hawkeye' AND name NOT LIKE '.inner_id.%'\")).scalar()
    print('tables:', n)
e.dispose()
"
```
Expected: `tables:` 뒤에 양수(대략 70여 개). **실패 시**: 드라이버를 `clickhouse-connect`로 교체하는 대안(ADR-0021 기각안)으로 되돌아가 재승인 후 Task 1·3의 접속부만 수정한다.

- [ ] **Step 3: API 스모크** — introspect가 tables를 반환하는지(인증 토큰 필요 — README/기존 E2E의 로그인 절차 사용)

```bash
# 로그인해 access token을 얻은 뒤:
curl -s -X POST http://localhost:4000/api/introspect \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"dialect":"clickhouse","host":"clickhouse.example.test","port":8123,"username":"hawkeye","password":"<CH_PASSWORD>","database":"hawkeye"}' \
  | python -m json.tool | head -30
```
Expected: `tables` 배열에 `events` 등, 각 컬럼에 `type`(예: `LowCardinality(String)`)이 실려 오고 `.inner_id.*`가 없음.

- [ ] **Step 4: E2E(실 브라우저)** — 새 Playwright spec `frontend/tests/e2e/clickhouse-import.spec.ts`(기존 db-import E2E 패턴 참고). ClickHouse 선택→접속정보 입력→Connect→ERD에 `events` 테이블 카드와 컬럼·타입이 렌더되고 `.inner_id.*` 카드가 없음을 단언.

Run: `cd frontend && VITE_PROXY_TARGET=http://localhost:4000 npx playwright test clickhouse-import --project=chromium --reporter=line`
Expected: PASS. (spec 코드는 기존 db-import E2E의 셀렉터·로그인 헬퍼를 그대로 재사용해 작성 — `db-connect-dialect`에 `clickhouse` 선택, `db-connect-host`=`clickhouse.example.test`, `db-connect-port`=`8123`, `db-connect-username`/`password`/`database` 입력.)

- [ ] **Step 5: 커밋 + 브랜치 마무리**

```bash
git add frontend/tests/e2e/clickhouse-import.spec.ts
git commit -m "test(e2e): ClickHouse import renders tables+columns"
```
이후 `superpowers:finishing-a-development-branch`로 병합/PR 결정.

---

## Self-Review

**Spec coverage:**
- 백엔드 dialect/URL/드라이버 → Task 1. 구조화 DTO + 조립 → Task 2. `introspect_clickhouse`+디스패치+라우트 → Task 3. `list_schemas`는 기존 `if req.dialect != "postgresql": return []`가 clickhouse에도 그대로 적용되므로 변경 불요(스키마 선택 UI도 postgresql 게이트라 자동 미노출) — 명시적 태스크 없음이 맞다.
- 프론트 타입 → Task 4. `buildDbmlFromTables` → Task 5. 다이얼로그 배선(옵션·포트·분기) → Task 6.
- 도메인 문서 → Task 7. 검증(드라이버 스모크·API·E2E) → Task 8.
- DB 동기화(ADR-0009)는 `DbConnectDialog` 재사용 + 변환이 handleConnect 한 곳이라 Task 6으로 자동 커버(별도 태스크 불요) — 설계 "범위 밖(자동 획득)"과 일치.

**Placeholder scan:** TBD/TODO 없음. 모든 코드 스텝에 실제 코드·명령·기대출력 포함. E2E spec만 "기존 패턴 재사용"으로 위임했으나 셀렉터·입력값을 구체 명시했다.

**Type consistency:** `IntrospectedColumn/Table` 필드(name/type/comment, name/engine/columns)가 백엔드(Task 2 Pydantic)·프론트(Task 4 TS)·`buildDbmlFromTables`(Task 5)에서 동일. `buildDbmlFromTables`는 `SqlImportResult`를 반환해 `handleConnect`의 `importSqlToDbml`와 분기 형태 일치(`{ok, dbml|errors}`). `IntrospectResult`는 키워드 생성이라 필드 순서 변경 안전.
