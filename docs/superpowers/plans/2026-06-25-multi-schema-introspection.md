# 멀티 스키마 인트로스펙션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 프로젝트의 ERD에 여러 PostgreSQL 스키마를 함께 담을 수 있도록, DB Connection을 다중 스키마 선택형으로 만들고 DB Sync 삭제 범위를 동기화한 스키마로 한정한다.

**Architecture:** 내부 모델(`DbmlTable.schema`, `${schema}.${table}` 키, 레이아웃 키)은 이미 스키마 한정이므로 그릇은 그대로 둔다. 변경은 (1) 백엔드 인트로스펙션 입력을 단일→다중 스키마로 넓히고 스키마 한정 DDL을 누적 생성, (2) 스키마 목록 조회 엔드포인트 추가, (3) 프론트 다중 선택 UI, (4) `mergeDbml`에 `syncedSchemas`를 받아 동기화하지 않은 스키마의 테이블·enum·ref를 보존하는 것에 집중된다.

**Tech Stack:** 백엔드 FastAPI + SQLAlchemy(리플렉션) + Pydantic. 프론트 React + Vite + TypeScript, `@dbml/core`(rawDb v2 JSON), react-i18next, TanStack Query, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-25-multi-schema-introspection-design.md`

## Global Constraints

- 백엔드 계층 분리(B1): 라우트는 검증·DI만, 외부 DB 조회/로직은 `services`에. 라우트에서 ORM/쿼리 직접 사용 금지.
- 모델 변경 없음 → **Alembic 마이그레이션 불필요**(연결 정보 비저장 유지, B2 무관).
- 프론트 사용자 노출 문자열은 모두 i18n 키로(F4): 새 문자열은 **ko/en 양쪽**(`src/shared/i18n/locales/{ko,en}.json`)에 먼저 추가한 뒤 `t()`로 소비. `data-testid`는 언어 무관 고정.
- 프론트 UI는 공용 토큰·최소 단위 컴포넌트로(F1): 체크박스/버튼은 기존 `inputClass`·`Button` 등 공용 단위 사용, 호출부 인라인 매직넘버 금지.
- FSD 경계(F3): import 방향 `shared ← entities ← features ← widgets ← pages ← app`.
- 멀티 스키마는 **PostgreSQL 전용**. MariaDB는 DB가 스코프이므로 기존 단일 동작 유지(`schemas=[None]`).
- `db_schemas` 비어 있으면 기존처럼 PostgreSQL은 `["public"]`.
- 검증 명령:
  - 백엔드: `docker compose -p codegram exec -T backend pytest -q`
  - 프론트 타입: `cd frontend && npm run type-check`
  - 프론트 단위: `cd frontend && npm run test:run`
  - E2E: `cd frontend && VITE_PROXY_TARGET=http://localhost:4000 npx playwright test <spec> --project=chromium --reporter=line`

---

## File Structure

**백엔드**
- Modify `backend/app/schemas/introspect.py` — `IntrospectRequest.db_schema` → `db_schemas`; add `SchemaListResponse`.
- Modify `backend/app/services/introspect.py` — `effective_schema` → `reflect_schemas`; 다중 스키마 리플렉션 루프; `_patch_unknown_types` 스키마 키잉; `list_schemas` 추가.
- Modify `backend/app/api/routes/introspect.py` — `POST /introspect/schemas` 라우트 추가.
- Modify `backend/tests/test_introspect_service.py` — 변경 헬퍼/키잉 테스트 갱신·추가.

**프론트**
- Modify `frontend/src/entities/dbml/lib/mergeDbml.ts` — `syncedSchemas` 파라미터 + 비동기화 스키마 보존.
- Modify `frontend/src/entities/dbml/lib/mergeDbml.test.ts` — 기존 호출 갱신 + 보존 테스트 추가.
- Modify `frontend/src/features/db-import/model/types.ts` — `db_schemas`, `SchemaListResponse`.
- Modify `frontend/src/features/db-import/api/useIntrospect.ts` — `useListSchemas` 추가.
- Modify `frontend/src/features/db-import/index.ts` — 신규 export.
- Modify `frontend/src/features/db-import/ui/DbConnectDialog.tsx` — 다중 선택 UI; `onIntrospected` 3번째 인자 `schemas`.
- Modify `frontend/src/features/db-import/ui/DbConnectDialog.test.tsx` — 다중 선택 흐름 테스트.
- Modify `frontend/src/features/db-import/ui/DbImportButton.tsx` + `.test.tsx` — `onIntrospected` 시그니처.
- Modify `frontend/src/pages/editor/index.tsx` + `index.test.tsx` — `syncedSchemas`를 `applySync`→`mergeDbml`로 전달.
- Modify `frontend/src/shared/i18n/locales/{ko,en}.json` — `dbConnect` 키 추가/정리.

---

## Task 1: 백엔드 — `db_schemas` 스키마 + `reflect_schemas` 헬퍼

**Files:**
- Modify: `backend/app/schemas/introspect.py`
- Modify: `backend/app/services/introspect.py:126-131` (`effective_schema`)
- Test: `backend/tests/test_introspect_service.py`

**Interfaces:**
- Produces: `IntrospectRequest.db_schemas: list[str] | None`; `reflect_schemas(req: IntrospectRequest) -> list[str | None]` (PostgreSQL → `db_schemas or ["public"]`, MariaDB → `[None]`).

- [ ] **Step 1: `IntrospectRequest` 필드 교체**

`backend/app/schemas/introspect.py`의 `db_schema` 라인을 교체:

```python
    database: str = Field(min_length=1)
    # PostgreSQL: target namespaces to reflect (default ["public"]). Empty/None
    # means ["public"]. MariaDB ignores this (the connected database IS the scope).
    db_schemas: list[str] | None = None
    ssl: bool = False
```

모듈 상단 docstring의 `db_schema` 언급도 `db_schemas`로 맞춰 한 줄 수정(문구만, 동작 무관).

- [ ] **Step 2: 실패하는 테스트 작성 (`reflect_schemas`)**

`backend/tests/test_introspect_service.py`의 `test_effective_schema`를 아래로 **교체**(헬퍼 이름·시그니처 변경):

```python
def test_reflect_schemas_postgres_and_mariadb():
    from app.services.introspect import reflect_schemas
    assert reflect_schemas(_req()) == ["public"]
    assert reflect_schemas(_req(db_schemas=[])) == ["public"]
    assert reflect_schemas(_req(db_schemas=["public", "sales"])) == ["public", "sales"]
    assert reflect_schemas(_req(dialect="mariadb")) == [None]
```

그리고 파일 상단 import에서 `effective_schema`를 `reflect_schemas`로 변경:

```python
from app.services.introspect import (
    build_connection_url,
    reflect_schemas,
)
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `docker compose -p codegram exec -T backend pytest -q backend/tests/test_introspect_service.py::test_reflect_schemas_postgres_and_mariadb`
(컨테이너 작업 경로 기준 경로 조정 가능. 일반적으로 `pytest -q tests/test_introspect_service.py::test_reflect_schemas_postgres_and_mariadb`.)
Expected: FAIL — `ImportError: cannot import name 'reflect_schemas'`.

- [ ] **Step 4: `reflect_schemas` 구현 (`effective_schema` 교체)**

`backend/app/services/introspect.py:126-131`의 `effective_schema`를 교체:

```python
def reflect_schemas(req: IntrospectRequest) -> list[str | None]:
    """Schemas to reflect. PostgreSQL: the selected namespaces (default
    ["public"]). MariaDB: [None] — the connected database IS the scope, so a
    single schema=None reflection covers it."""
    if req.dialect == "postgresql":
        return list(req.db_schemas) if req.db_schemas else ["public"]
    return [None]
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `docker compose -p codegram exec -T backend pytest -q tests/test_introspect_service.py::test_reflect_schemas_postgres_and_mariadb`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add backend/app/schemas/introspect.py backend/app/services/introspect.py backend/tests/test_introspect_service.py
git commit -m "feat(introspect): accept db_schemas list; reflect_schemas helper"
```

---

## Task 2: 백엔드 — 다중 스키마 리플렉션 + 스키마 키잉

**Files:**
- Modify: `backend/app/services/introspect.py` (`introspect_to_ddl:268-311`, `_patch_unknown_types:205-221`)
- Test: `backend/tests/test_introspect_service.py`

**Interfaces:**
- Consumes: `reflect_schemas` (Task 1).
- Produces: `_patch_unknown_types(metadata, raw_names)` where `raw_names: dict[tuple[str | None, str, str], str]` keyed by `(schema, table, column)`. `introspect_to_ddl` reflects every schema from `reflect_schemas(req)` into one MetaData (스키마 한정 DDL 누적).

- [ ] **Step 1: 실패하는 테스트 작성 (스키마 한정 DDL + 스키마 키잉)**

`backend/tests/test_introspect_service.py`에 추가:

```python
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
```

그리고 **기존** `test_patch_unknown_types_restores_raw_name`의 raw_names 키를 3-튜플로 갱신(테이블에 schema 미지정 → `None`):

```python
    patched = _patch_unknown_types(md, {(None, "rag_chunks", "embedding"): "vector"})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose -p codegram exec -T backend pytest -q tests/test_introspect_service.py -k "keys_by_schema or qualifies_table"`
Expected: FAIL — `test_patch_unknown_types_keys_by_schema`는 현재 2-튜플 키를 못 찾아 `vector`/`geometry` 미포함. (`qualifies_table`은 이미 통과할 수 있음 — SQLAlchemy가 schema 한정 렌더 → 그렇다면 그 케이스는 회귀 가드로 통과 유지.)

- [ ] **Step 3: `_patch_unknown_types` 스키마 키잉 구현**

`backend/app/services/introspect.py:205-221`의 함수 본문에서 lookup 키를 교체:

```python
def _patch_unknown_types(
    metadata: MetaData, raw_names: dict[tuple[str | None, str, str], str]
) -> list[str]:
    """Replace every NullType column (a DB type SQLAlchemy can't map) with a
    type that compiles: the original DB type name when known (`raw_names`,
    keyed by (schema, table, column)), else TEXT. Mutates `metadata` in place;
    returns the patched `schema.table.column` identifiers for logging.
    """
    patched: list[str] = []
    for table in metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, NullType):
                raw = raw_names.get((table.schema, table.name, column.name))
                column.type = _RawType(raw) if raw else Text()
                patched.append(f"{table.schema}.{table.name}.{column.name}")
    return patched
```

- [ ] **Step 4: `introspect_to_ddl` 다중 스키마 루프 구현**

`backend/app/services/introspect.py:274-291`의 reflect 블록을 교체:

```python
        metadata = MetaData()
        raw_names: dict[tuple[str | None, str, str], str] = {}
        try:
            with engine.connect() as conn:
                for sch in reflect_schemas(req):
                    metadata.reflect(bind=conn, schema=sch)
                    if req.dialect == "postgresql":
                        for (tbl, col), udt in _postgres_raw_type_names(
                            conn, sch
                        ).items():
                            raw_names[(sch, tbl, col)] = udt
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
```

(아래 `_patch_unknown_types(metadata, raw_names)` 호출은 그대로 — 키 모양만 위에서 맞췄다.)

- [ ] **Step 5: 테스트 통과 확인**

Run: `docker compose -p codegram exec -T backend pytest -q tests/test_introspect_service.py`
Expected: PASS (전체 — 갱신한 기존 테스트 포함)

- [ ] **Step 6: 커밋**

```bash
git add backend/app/services/introspect.py backend/tests/test_introspect_service.py
git commit -m "feat(introspect): reflect multiple schemas; key raw types by schema"
```

---

## Task 3: 백엔드 — 스키마 목록 조회 엔드포인트

**Files:**
- Modify: `backend/app/services/introspect.py` (신규 `list_schemas`)
- Modify: `backend/app/schemas/introspect.py` (신규 `SchemaListResponse`)
- Modify: `backend/app/api/routes/introspect.py` (신규 라우트)
- Test: `backend/tests/test_introspect_service.py`

**Interfaces:**
- Consumes: `build_connection_url` (기존).
- Produces: `list_schemas(req: IntrospectRequest) -> list[str]` (PostgreSQL: 시스템 스키마 제외 목록; MariaDB: `[]`). `SchemaListResponse(schemas: list[str])`. `POST /api/introspect/schemas`.

- [ ] **Step 1: 실패하는 테스트 작성 (`list_schemas` MariaDB 단락)**

`backend/tests/test_introspect_service.py`에 추가(라이브 DB 없이 검증 가능한 경계만):

```python
def test_list_schemas_mariadb_returns_empty():
    """MariaDB has no schema concept (the database is the scope) — no connect."""
    from app.services.introspect import list_schemas
    assert list_schemas(_req(dialect="mariadb")) == []
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose -p codegram exec -T backend pytest -q tests/test_introspect_service.py::test_list_schemas_mariadb_returns_empty`
Expected: FAIL — `ImportError: cannot import name 'list_schemas'`.

- [ ] **Step 3: `list_schemas` 구현**

`backend/app/services/introspect.py`에 추가(예: `introspect_to_ddl` 위, `IntrospectError`들 아래):

```python
def list_schemas(req: IntrospectRequest) -> list[str]:
    """Connect and list selectable PostgreSQL schemas (system schemas excluded).
    MariaDB returns [] without connecting (the database IS the scope). SYNC —
    run in a threadpool. Always disposes the engine."""
    if req.dialect != "postgresql":
        return []
    url, connect_args, _ = build_connection_url(req)
    engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT schema_name FROM information_schema.schemata "
                    "WHERE schema_name NOT LIKE 'pg\\_%' "
                    "AND schema_name <> 'information_schema' "
                    "ORDER BY schema_name"
                )
            )
            return [r.schema_name for r in rows]
    except OperationalError as exc:
        raise ConnectionFailedError(
            "데이터베이스에 접속할 수 없습니다. 접속 정보를 확인하세요."
        ) from exc
    except SQLAlchemyError as exc:
        raise ConnectionFailedError(
            "스키마 목록을 읽는 중 오류가 발생했습니다."
        ) from exc
    finally:
        engine.dispose()
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `docker compose -p codegram exec -T backend pytest -q tests/test_introspect_service.py::test_list_schemas_mariadb_returns_empty`
Expected: PASS

- [ ] **Step 5: `SchemaListResponse` 추가**

`backend/app/schemas/introspect.py` 끝에 추가:

```python
class SchemaListResponse(BaseModel):
    """Backend returns the selectable schema names (PostgreSQL)."""

    schemas: list[str]
```

- [ ] **Step 6: 라우트 추가**

`backend/app/api/routes/introspect.py`의 import와 라우트 갱신:

```python
from app.schemas.introspect import (
    IntrospectRequest,
    IntrospectResponse,
    SchemaListResponse,
)
from app.services.introspect import (
    ConnectionFailedError,
    NoTablesFoundError,
    introspect_to_ddl,
    list_schemas,
)
```

그리고 기존 `introspect` 핸들러 아래에 추가:

```python
@router.post("/schemas", response_model=SchemaListResponse)
async def schemas(
    payload: IntrospectRequest,
    user: User = Depends(current_active_user),
) -> SchemaListResponse:
    """List selectable schemas for the target DB (PostgreSQL; MariaDB → [])."""
    try:
        names = await anyio.to_thread.run_sync(
            list_schemas, payload, abandon_on_cancel=True
        )
    except ConnectionFailedError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from None
    return SchemaListResponse(schemas=names)
```

- [ ] **Step 7: 전체 백엔드 테스트 + 라우트 import 확인**

Run: `docker compose -p codegram exec -T backend pytest -q`
Expected: PASS (import·앱 기동 무결성 포함)

- [ ] **Step 8: 커밋**

```bash
git add backend/app/services/introspect.py backend/app/schemas/introspect.py backend/app/api/routes/introspect.py backend/tests/test_introspect_service.py
git commit -m "feat(introspect): POST /introspect/schemas to list selectable schemas"
```

---

## Task 4: 프론트 — `mergeDbml(current, incoming, syncedSchemas)` 비동기화 스키마 보존

**Files:**
- Modify: `frontend/src/entities/dbml/lib/mergeDbml.ts`
- Test: `frontend/src/entities/dbml/lib/mergeDbml.test.ts`

**Interfaces:**
- Produces: `mergeDbml(current: string, incoming: string, syncedSchemas: string[]): string`. `syncedSchemas`가 비면 `incoming`의 스키마 집합으로 간주(= 종전 동작). `syncedSchemas`에 없는 스키마의 테이블·enum·ref는 `current`에서 그대로 보존.

- [ ] **Step 1: 실패하는 테스트 작성 (비동기화 스키마 보존) + 기존 호출 갱신**

`frontend/src/entities/dbml/lib/mergeDbml.test.ts`:

(a) 기존 모든 `mergeDbml(CURRENT, INCOMING)` 호출을 `mergeDbml(CURRENT, INCOMING, ['public'])`로 변경(테스트 DBML이 전부 기본 스키마이므로 동작 동일).

(b) 새 테스트 추가:

```python
# (TypeScript) 아래 블록을 mergeDbml.test.ts에 추가
```
```ts
const CURRENT_MULTI = `Table "public"."users" {
  id int [pk]
}

Table "sales"."orders" {
  id int [pk]
  user_id int
}

Ref: "sales"."orders".user_id > "public"."users".id
`

// Re-sync ONLY public: incoming carries just the public schema.
const INCOMING_PUBLIC = `Table "public"."users" {
  id int [pk]
  email varchar
}

Table "public"."accounts" {
  id int [pk]
}
`

describe('mergeDbml multi-schema', () => {
  it('preserves tables of schemas not being synced', () => {
    const merged = schema(mergeDbml(CURRENT_MULTI, INCOMING_PUBLIC, ['public']))
    const ids = merged.tables.map((t) => t.id).sort()
    expect(ids).toContain('sales.orders') // preserved (not synced)
    expect(ids).toContain('public.users') // updated from DB
    expect(ids).toContain('public.accounts') // added from DB
  })

  it('still drops tables removed from a synced schema', () => {
    const merged = schema(mergeDbml(CURRENT_MULTI, INCOMING_PUBLIC, ['public']))
    // public had only `users`; nothing public was dropped here, but a public
    // table absent from incoming must not survive:
    const current2 = CURRENT_MULTI + '\nTable "public"."stale" {\n  id int [pk]\n}\n'
    const merged2 = schema(mergeDbml(current2, INCOMING_PUBLIC, ['public']))
    expect(merged2.tables.map((t) => t.id)).not.toContain('public.stale')
    expect(merged2.tables.map((t) => t.id)).toContain('sales.orders')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/entities/dbml/lib/mergeDbml.test.ts`
Expected: FAIL — 타입 에러(3번째 인자) 및 `sales.orders`가 보존되지 않음(현재는 incoming만 출력 → 삭제됨).

- [ ] **Step 3: `mergeDbml` 구현**

`frontend/src/entities/dbml/lib/mergeDbml.ts`를 교체. RawDb 타입에 `refs`/`enums`를 추가하고 보존 로직을 넣는다:

```ts
type RawEndpoint = { schemaName?: string | null; tableName: string }
type RawRef = { endpoints?: RawEndpoint[] }
type RawEnum = { name: string; schemaName?: string | null }
type RawDb = {
  tables?: RawTable[]
  tableGroups?: RawGroup[]
  notes?: unknown[]
  refs?: RawRef[]
  enums?: RawEnum[]
  project?: Record<string, unknown> | null
}

/** Schema-qualified key (`${schema}.${name}`), defaulting schema to "public". */
function keyOf(t: { name: string; schemaName?: string | null }): string {
  return `${t.schemaName ?? 'public'}.${t.name}`
}
function schemaOf(x: { schemaName?: string | null }): string {
  return x.schemaName ?? 'public'
}
function epKey(ep: RawEndpoint): string {
  return `${ep.schemaName ?? 'public'}.${ep.tableName}`
}

export function mergeDbml(
  current: string,
  incoming: string,
  syncedSchemas: string[],
): string {
  let rawOld: RawDb
  let rawNew: RawDb
  try {
    rawOld = Parser.parseDBMLToJSONv2(current) as unknown as RawDb
    rawNew = Parser.parseDBMLToJSONv2(incoming) as unknown as RawDb
  } catch {
    return incoming
  }

  try {
    // Schemas governed by this sync. Empty → infer from incoming (legacy behavior).
    const synced = new Set(
      syncedSchemas.length
        ? syncedSchemas
        : (rawNew.tables ?? []).map(schemaOf),
    )

    const oldTables = new Map<string, RawTable>()
    for (const t of rawOld.tables ?? []) oldTables.set(keyOf(t), t)

    // Graft notes + headerColor onto surviving tables (live DB wins where set).
    for (const nt of rawNew.tables ?? []) {
      const ot = oldTables.get(keyOf(nt))
      if (!ot) continue
      if (!nt.note && ot.note) nt.note = ot.note
      if (!nt.headerColor && ot.headerColor) nt.headerColor = ot.headerColor
      const oldFields = new Map((ot.fields ?? []).map((f) => [f.name, f]))
      for (const nf of nt.fields ?? []) {
        const of = oldFields.get(nf.name)
        if (of && !nf.note && of.note) nf.note = of.note
      }
    }

    // Preserve everything from schemas NOT being synced: their tables aren't in
    // `incoming`, so without this they'd be silently dropped.
    const preservedTables = (rawOld.tables ?? []).filter(
      (t) => !synced.has(schemaOf(t)),
    )
    rawNew.tables = [...(rawNew.tables ?? []), ...preservedTables]
    const preservedEnums = (rawOld.enums ?? []).filter(
      (e) => !synced.has(schemaOf(e)),
    )
    rawNew.enums = [...(rawNew.enums ?? []), ...preservedEnums]

    const finalKeys = new Set((rawNew.tables ?? []).map(keyOf))
    // Carry refs touching a preserved (non-synced) table, when both endpoints
    // still resolve in the merged set. (Cross-schema synced↔non-synced refs may
    // not survive a partial sync; re-sync both schemas to restore them.)
    const preservedRefs = (rawOld.refs ?? []).filter(
      (r) =>
        (r.endpoints ?? []).some((ep) => !synced.has(ep.schemaName ?? 'public')) &&
        (r.endpoints ?? []).every((ep) => finalKeys.has(epKey(ep))),
    )
    rawNew.refs = [...(rawNew.refs ?? []), ...preservedRefs]

    // Carry table groups, dropping members absent from the FINAL table set.
    rawNew.tableGroups = (rawOld.tableGroups ?? [])
      .map((g) => ({
        ...g,
        tables: (g.tables ?? []).filter((m) => finalKeys.has(keyOf(m))),
      }))
      .filter((g) => g.tables.length > 0)

    // Carry standalone (sticky) notes verbatim — purely a Codegram overlay.
    rawNew.notes = rawOld.notes ?? []

    // Keep the old Project block (name/note) when introspection produced none.
    if (
      rawOld.project &&
      (!rawNew.project || Object.keys(rawNew.project).length === 0)
    ) {
      rawNew.project = rawOld.project
    }

    const db = Parser.parseJSONToDatabase(rawNew)
    return ModelExporter.export(db.normalize(), 'dbml')
  } catch {
    return incoming
  }
}
```

또한 파일 상단 JSDoc(3-19줄)에 한 줄 추가: `syncedSchemas`에 없는 스키마의 테이블/enum/ref는 보존한다는 설명.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/entities/dbml/lib/mergeDbml.test.ts`
Expected: PASS (기존 + 신규)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/entities/dbml/lib/mergeDbml.ts frontend/src/entities/dbml/lib/mergeDbml.test.ts
git commit -m "feat(dbml): mergeDbml preserves non-synced schemas (syncedSchemas arg)"
```

---

## Task 5: 프론트 — 타입 + `useListSchemas` 훅 + export

**Files:**
- Modify: `frontend/src/features/db-import/model/types.ts`
- Modify: `frontend/src/features/db-import/api/useIntrospect.ts`
- Modify: `frontend/src/features/db-import/index.ts`

**Interfaces:**
- Consumes: 백엔드 `POST /api/introspect/schemas` → `{ schemas: string[] }` (Task 3).
- Produces: `IntrospectRequest.db_schemas?: string[]`; `SchemaListResponse { schemas: string[] }`; `useListSchemas()` mutation.

- [ ] **Step 1: 타입 갱신**

`frontend/src/features/db-import/model/types.ts`의 `IntrospectRequest`에서 `db_schema?` 라인을 교체하고 응답 타입 추가:

```ts
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

export interface IntrospectResponse {
  import_dialect: 'postgres' | 'mysql'
  ddl: string
  table_count: number
}

/** Matches backend SchemaListResponse. */
export interface SchemaListResponse {
  schemas: string[]
}
```

- [ ] **Step 2: `useListSchemas` 훅 추가**

`frontend/src/features/db-import/api/useIntrospect.ts`에 추가(같은 파일, 단일 출처):

```ts
import type {
  IntrospectRequest,
  IntrospectResponse,
  SchemaListResponse,
} from '../model/types'

// ... 기존 introspect/useIntrospect 유지 ...

/** POST /api/introspect/schemas — list selectable schemas for the target DB. */
function listSchemas(req: IntrospectRequest): Promise<SchemaListResponse> {
  return apiFetch<SchemaListResponse>('/introspect/schemas', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/** Mutation wrapper; no cache invalidation (transient, read-only call). */
export function useListSchemas() {
  return useMutation({ mutationFn: listSchemas })
}
```

- [ ] **Step 3: export 갱신**

`frontend/src/features/db-import/index.ts`:

```ts
export { useIntrospect, useListSchemas } from './api/useIntrospect'
export type {
  IntrospectDialect,
  IntrospectRequest,
  IntrospectResponse,
  SchemaListResponse,
} from './model/types'
```

- [ ] **Step 4: 타입 체크**

Run: `cd frontend && npm run type-check`
Expected: PASS (`DbConnectDialog.tsx`는 아직 `db_schema`를 보낼 수 있으니, 이 단계에서 에러가 나면 다음 Task 6에서 함께 정리된다 — 만약 즉시 실패하면 Task 6의 dialog 수정을 먼저 진행해도 무방. 그 외 파일은 통과해야 한다.)

> 참고: `db_schema` → `db_schemas` 교체로 `DbConnectDialog.tsx`가 일시적으로 타입 에러를 낼 수 있다. Task 6에서 같은 PR/브랜치 내에 바로 해소하므로, 두 Task를 연속 실행한다.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/db-import/model/types.ts frontend/src/features/db-import/api/useIntrospect.ts frontend/src/features/db-import/index.ts
git commit -m "feat(db-import): db_schemas type + useListSchemas hook"
```

---

## Task 6: 프론트 — DbConnectDialog 다중 선택 UI + i18n

**Files:**
- Modify: `frontend/src/shared/i18n/locales/ko.json`, `frontend/src/shared/i18n/locales/en.json`
- Modify: `frontend/src/features/db-import/ui/DbConnectDialog.tsx`
- Modify: `frontend/src/features/db-import/ui/DbConnectDialog.test.tsx`

**Interfaces:**
- Consumes: `useListSchemas` (Task 5).
- Produces: `onIntrospected(dbml: string, databaseName: string, schemas: string[])` (3번째 인자 = 인트로스펙트에 사용한 스키마 배열). UI: data-testid `db-connect-load-schemas`(버튼), `db-connect-schema-option-${name}`(체크박스).

- [ ] **Step 1: i18n 키 추가/정리 (ko + en 양쪽)**

`ko.json`의 `dbConnect`에서 `"schema"` 키를 **제거**(단일 입력 폐기로 고아가 됨)하고 아래 키 추가:

```json
    "schemas": "스키마",
    "loadSchemas": "스키마 불러오기",
    "loadingSchemas": "스키마 불러오는 중…",
    "noSchemas": "선택할 스키마가 없습니다",
    "selectSchemaHint": "ERD에 포함할 스키마를 하나 이상 선택하세요"
```

`en.json`의 `dbConnect`에서 `"schema"` 제거하고:

```json
    "schemas": "Schemas",
    "loadSchemas": "Load schemas",
    "loadingSchemas": "Loading schemas…",
    "noSchemas": "No schemas to select",
    "selectSchemaHint": "Select at least one schema to include in the ERD"
```

- [ ] **Step 2: 실패하는 테스트 작성 (다중 선택 흐름)**

`frontend/src/features/db-import/ui/DbConnectDialog.test.tsx`에 추가(기존 파일의 mock 패턴을 따른다). useListSchemas를 모킹해 `['public','sales']` 반환, public/sales 체크 후 connect → `onIntrospected` 3번째 인자가 선택 스키마인지 검증:

```ts
// 파일 상단 vi.mock에 useListSchemas를 포함 (기존 useIntrospect mock과 같은 모듈)
// 예: vi.mock('../api/useIntrospect', () => ({ useIntrospect: ..., useListSchemas: ... }))
it('loads schemas, lets the user pick several, and sends db_schemas', async () => {
  const onIntrospected = vi.fn()
  // mutateAsync mocks: listSchemas → { schemas: ['public','sales'] }, introspect → { ddl, import_dialect, table_count }
  render(
    <DbConnectDialog open onOpenChange={vi.fn()} onIntrospected={onIntrospected} />,
  )
  // fill host/port/username/database (reuse existing helpers in this file)
  // click "스키마 불러오기"
  await userEvent.click(screen.getByTestId('db-connect-load-schemas'))
  // both checkboxes appear
  expect(screen.getByTestId('db-connect-schema-option-public')).toBeInTheDocument()
  // select sales in addition to public
  await userEvent.click(screen.getByTestId('db-connect-schema-option-sales'))
  await userEvent.click(screen.getByRole('button', { name: '연결' }))
  expect(onIntrospected).toHaveBeenCalledTimes(1)
  const [, , schemas] = onIntrospected.mock.calls[0]
  expect(schemas).toEqual(expect.arrayContaining(['public', 'sales']))
})
```

(기존 테스트들의 `db-connect-schema` 입력 채우기 단계가 있으면 제거하고, 필요한 경우 introspect mock이 schemas 없이도 동작하도록 정리한다.)

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/features/db-import/ui/DbConnectDialog.test.tsx`
Expected: FAIL — `db-connect-load-schemas`/`db-connect-schema-option-*` 미존재.

- [ ] **Step 4: DbConnectDialog 구현**

`frontend/src/features/db-import/ui/DbConnectDialog.tsx`:

(a) import에 `useListSchemas` 추가, `onIntrospected` 타입을 3-인자로:

```ts
import { useIntrospect, useListSchemas } from '../api/useIntrospect'
```
```ts
  onIntrospected: (
    dbml: string,
    databaseName: string,
    schemas: string[],
  ) => void | Promise<void>
```

(b) 상태 교체: `const [schema, setSchema] = useState('public')` 제거. 추가:

```ts
  const listSchemas = useListSchemas()
  const [available, setAvailable] = useState<string[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
```

`reset()`에서 `setSchema('public')` 대신 `setAvailable(null); setSelected([])`. `handleDialectChange`에서도 `setAvailable(null); setSelected([])`.

(c) 스키마 불러오기 핸들러:

```ts
  async function handleLoadSchemas() {
    setErrors(null)
    try {
      const res = await listSchemas.mutateAsync({
        dialect, host, port, username, password, database, ssl,
      })
      setAvailable(res.schemas)
      setSelected(res.schemas.includes('public') ? ['public'] : [])
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : t('dbConnect.failedConnect')
      setErrors([{ message }])
    }
  }

  function toggleSchema(name: string) {
    setSelected((cur) =>
      cur.includes(name) ? cur.filter((s) => s !== name) : [...cur, name],
    )
  }
```

(d) `handleConnect`에서 전송 필드 교체 + `onIntrospected`에 selected 전달:

```ts
      response = await introspect.mutateAsync({
        dialect, host, port, username, password, database, ssl,
        db_schemas: dialect === 'postgresql' ? selected : undefined,
      })
```
```ts
      await onIntrospected(result.dbml, database, selected)
```

(e) JSX의 PostgreSQL 단일 schema `<label>…db-connect-schema…</label>` 블록(202-213줄)을 다중 선택 블록으로 교체(F1: 공용 `Button`/`inputClass` 토큰 사용):

```tsx
          {dialect === 'postgresql' && (
            <div className="flex flex-col gap-1 text-sm font-medium">
              <div className="flex items-center justify-between">
                <span>{t('dbConnect.schemas')}</span>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="db-connect-load-schemas"
                  onClick={handleLoadSchemas}
                  disabled={
                    listSchemas.isPending ||
                    host.trim().length === 0 ||
                    database.trim().length === 0
                  }
                >
                  {listSchemas.isPending
                    ? t('dbConnect.loadingSchemas')
                    : t('dbConnect.loadSchemas')}
                </Button>
              </div>
              {available !== null && (
                <div className="flex flex-col gap-1">
                  {available.length === 0 && (
                    <span className="text-muted-foreground">
                      {t('dbConnect.noSchemas')}
                    </span>
                  )}
                  {available.map((name) => (
                    <label key={name} className="flex items-center gap-2 font-normal">
                      <input
                        type="checkbox"
                        data-testid={`db-connect-schema-option-${name}`}
                        checked={selected.includes(name)}
                        onChange={() => toggleSchema(name)}
                      />
                      {name}
                    </label>
                  ))}
                  <span className="text-xs text-muted-foreground">
                    {t('dbConnect.selectSchemaHint')}
                  </span>
                </div>
              )}
            </div>
          )}
```

(f) Connect 버튼 `disabled`에 PostgreSQL일 때 스키마 미선택 가드 추가:

```ts
            disabled={
              introspect.isPending ||
              host.trim().length === 0 ||
              database.trim().length === 0 ||
              !(port > 0) ||
              (dialect === 'postgresql' && selected.length === 0)
            }
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/features/db-import/ui/DbConnectDialog.test.tsx`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/db-import/ui/DbConnectDialog.tsx frontend/src/features/db-import/ui/DbConnectDialog.test.tsx frontend/src/shared/i18n/locales/ko.json frontend/src/shared/i18n/locales/en.json
git commit -m "feat(db-import): multi-schema select UI in DbConnectDialog"
```

---

## Task 7: 프론트 — onIntrospected 시그니처 전파 + 에디터 sync 배선

**Files:**
- Modify: `frontend/src/features/db-import/ui/DbImportButton.tsx`, `DbImportButton.test.tsx`
- Modify: `frontend/src/pages/editor/index.tsx` (`pendingSyncDbml`/`applySync`/`onIntrospected`), `index.test.tsx`

**Interfaces:**
- Consumes: `mergeDbml(current, incoming, syncedSchemas)` (Task 4), `onIntrospected(dbml, name, schemas)` (Task 6).
- Produces: 에디터 sync가 인트로스펙트에 사용한 스키마를 `mergeDbml`의 `syncedSchemas`로 전달.

- [ ] **Step 1: DbImportButton 시그니처 수용 (신규 프로젝트 — schemas 미사용)**

`frontend/src/features/db-import/ui/DbImportButton.tsx`의 `handleIntrospected`가 3번째 인자를 받되 무시하도록(신규 프로젝트 생성엔 불필요). 기존 시그니처가 `(dbml, name)`이면 그대로 두어도 호출 호환되지만, 타입 일치를 위해 콜백 타입을 맞춘다. 실제 본문 로직 변경 없음.

`DbImportButton.test.tsx`의 mock 콜백 타입과 호출(`onIntrospected('Table ...', 'mydb')`)은 추가 인자 없이도 동작 — 필요 시 `onIntrospected('Table ...', 'mydb', ['public'])`로 갱신.

- [ ] **Step 2: 실패하는 테스트 작성 (에디터가 syncedSchemas를 mergeDbml로 전달)**

`frontend/src/pages/editor/index.test.tsx`의 DbConnectDialog mock(662-667줄 부근)에서 `onIntrospected`를 3-인자로 호출하도록 갱신하고, 비동기화 스키마 보존을 검증하는 단언을 추가한다. (mock이 `props.onIntrospected(dbml, name, ['public'])` 형태로 호출 → sync 후 다른 스키마 테이블이 남는지 확인. 구체 단언은 기존 테스트의 노드/테이블 검증 방식을 따른다.)

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd frontend && npx vitest run src/pages/editor/index.test.tsx`
Expected: FAIL — mock 시그니처/`mergeDbml` 호출 인자 불일치.

- [ ] **Step 4: 에디터 배선 구현**

`frontend/src/pages/editor/index.tsx`:

(a) `pendingSyncDbml` 상태를 dbml+schemas 묶음으로 교체:

```ts
  const [pendingSync, setPendingSync] = useState<
    { dbml: string; schemas: string[] } | null
  >(null)
```

(b) `applySync` 시그니처/호출 교체:

```ts
  function applySync(incoming: string, syncedSchemas: string[]) {
    const merged = mergeDbml(dbmlText, incoming, syncedSchemas)
    const parsed = parseDbml(merged)
    if (parsed.ok) {
      setPositions(computeSyncedPositions(positions, parsed.schema))
    }
    setDbmlText(merged)
    setPendingSync(null)
  }
```

(c) DbConnectDialog `onIntrospected`(829-832줄):

```tsx
        onIntrospected={(dbml, _name, schemas) => {
          setSyncOpen(false)
          setPendingSync({ dbml, schemas })
        }}
```

(d) 확인 다이얼로그(834-852줄)의 `pendingSyncDbml` 참조를 `pendingSync`로, 확인 버튼을:

```tsx
      <Dialog
        open={pendingSync !== null}
        onOpenChange={(o) => { if (!o) setPendingSync(null) }}
      >
        ...
            <Button variant="outline" onClick={() => setPendingSync(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (pendingSync) applySync(pendingSync.dbml, pendingSync.schemas)
              }}
            >
              {t('editor.syncConfirm')}
            </Button>
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/pages/editor/index.test.tsx src/features/db-import/ui/DbImportButton.test.tsx`
Expected: PASS

- [ ] **Step 6: 전체 타입 + 단위 검증**

Run: `cd frontend && npm run type-check && npm run test:run`
Expected: PASS (전부)

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/features/db-import/ui/DbImportButton.tsx frontend/src/features/db-import/ui/DbImportButton.test.tsx frontend/src/pages/editor/index.tsx frontend/src/pages/editor/index.test.tsx
git commit -m "feat(editor): pass synced schemas into mergeDbml on DB sync"
```

---

## Task 8: E2E — 다중 스키마 선택 + 부분 재싱크 보존 (도커 스택 필요)

**Files:**
- Modify: `frontend/e2e/db-sync.spec.ts` (또는 신규 `db-multi-schema.spec.ts`)

**Interfaces:**
- Consumes: 도커 스택의 PostgreSQL(`-p codegram`)에 **두 개 이상의 스키마**(예: `public` + `sales`)가 존재해야 한다. 없으면 이 Task는 환경 준비가 선행 조건(아래 Step 1).

- [ ] **Step 1: 멀티 스키마 시드 확인/추가**

도커 DB에 두 번째 스키마가 없으면, E2E 전에 시드한다(테스트 셋업 또는 수동):

```bash
docker compose -p codegram exec -T postgres psql -U codegram_user -d codegram_dev -c "CREATE SCHEMA IF NOT EXISTS sales; CREATE TABLE IF NOT EXISTS sales.orders (id serial primary key);"
```

(자격 증명/DB명은 `db-sync.spec.ts`의 값과 맞춘다.)

- [ ] **Step 2: 셀렉터 갱신 — 단일 schema 입력 → 다중 선택**

`db-sync.spec.ts`의 `db-connect-schema` fill(86줄)을 다음으로 교체:

```ts
  await page.getByTestId('db-connect-load-schemas').click()
  await page.getByTestId('db-connect-schema-option-public').check()
```

- [ ] **Step 3: 부분 재싱크 보존 시나리오 추가(신규 test 블록)**

`public` + `sales`를 모두 적재한 프로젝트를 만든 뒤, sync 다이얼로그에서 **public만** 선택해 재싱크하고, `sales.orders` 노드가 보존되는지 검증:

```ts
  // ...로그인/프로젝트 생성(INITIAL_DBML에 sales.orders 포함)...
  // sync: public만 선택
  await page.getByTestId('db-connect-load-schemas').click()
  await page.getByTestId('db-connect-schema-option-public').check()
  // (sales는 체크하지 않음)
  // ...연결 → 동기화 확인...
  // sales.orders 노드가 여전히 존재
  await expect(
    page.locator('.react-flow__node[data-id="sales.orders"]'),
  ).toBeVisible()
```

- [ ] **Step 4: E2E 실행 (도커 스택 가동 시 호스트에서)**

Run: `cd frontend && VITE_PROXY_TARGET=http://localhost:4000 npx playwright test db-sync --project=chromium --reporter=line`
Expected: PASS. (도커 스택/멀티 스키마 시드가 없으면 이 Task는 SKIP로 보고하고, 단위 테스트(Task 4)가 핵심 로직을 커버함을 명시한다 — G3: 미실행은 미실행으로 보고.)

- [ ] **Step 5: 커밋**

```bash
git add frontend/e2e/db-sync.spec.ts
git commit -m "test(e2e): multi-schema select + partial re-sync preserves other schemas"
```

---

## Self-Review

**Spec coverage:**
- §4-① 스키마 목록 조회 → Task 3. ✓
- §4-② 다중 스키마 인트로스펙션(+raw type 스키마 키잉) → Task 1, 2. ✓
- §4-③ 다중 선택 UI(F1/F4) → Task 6 (+타입/훅 Task 5). ✓
- §4-④ Sync 삭제 범위 한정 → Task 4 (+배선 Task 7). ✓
- §5 검증: 백엔드 pytest(Task 1-3), 프론트 type-check/vitest(Task 4-7), E2E(Task 8). ✓
- §6 범위 밖(연결정보 영속화/MariaDB 다중 DB/교차 스키마 시각화): 계획에 포함하지 않음. 교차 스키마 ref의 부분-싱크 한계는 Task 4 코드 주석·이 문서에 명시. ✓

**Placeholder scan:** TBD/TODO 없음. 모든 코드 스텝에 실제 코드 포함. Task 2/8의 "이미 통과할 수 있음"·"SKIP 보고"는 환경 의존성에 대한 사실 안내이며 플레이스홀더가 아님.

**Type consistency:**
- 백엔드 `db_schemas: list[str] | None`(schemas) ↔ `reflect_schemas -> list[str | None]`(service) ↔ raw_names 키 `(str | None, str, str)` ↔ `_patch_unknown_types` lookup 일치. ✓
- 프론트 `IntrospectRequest.db_schemas?: string[]` ↔ dialog 전송 `db_schemas` ↔ `SchemaListResponse.schemas` ↔ `useListSchemas` 반환 일치. ✓
- `mergeDbml(current, incoming, syncedSchemas)` 3-인자 ↔ 에디터 `applySync(incoming, syncedSchemas)` ↔ `onIntrospected(dbml, name, schemas)` 일치. ✓
