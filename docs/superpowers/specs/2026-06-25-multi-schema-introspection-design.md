# 멀티 스키마 인트로스펙션 설계

- 날짜: 2026-06-25
- 상태: 설계 승인됨 (구현 계획 대기)
- 관련: ADR-0001(DBML 단일 진실), ADR-0008(DB 인트로스펙션), `.claude/rules/backend.md`, `.claude/rules/frontend.md`

## 1. 문제

한 프로젝트에 **여러 PostgreSQL 스키마의 ERD를 함께** 표현해야 할 수 있다. 현재는:

- **DB Connection(인트로스펙션)**: `IntrospectRequest.db_schema: str | None` — 단 하나의 스키마(기본 `public`)만 리플렉션한다.
- **DB Sync(`mergeDbml`)**: 이름은 "병합"이지만 실제로는 **인트로스펙션 결과(`incoming`)를 구조의 단일 진실로 보고, `incoming`에 없는 테이블을 전부 삭제**한다. 보존되는 것은 노트·헤더색·테이블 그룹·스티키노트 같은 메타데이터뿐이고 테이블 집합 자체는 교체된다.

따라서 "대표 스키마를 DB Connection으로 적재 → 다른 스키마를 DB Sync로 병합"이라는 수동 워크플로우는 **현재 구현에서 동작하지 않는다**: 두 번째 스키마를 sync하면 첫 번째 스키마의 테이블이 모두 삭제된다.

## 2. 핵심 사실 (코드 근거)

1. **스키마 한정자는 이미 끝까지 전달된다.** `introspect_to_ddl`은 `metadata.reflect(bind=conn, schema=effective_schema(req))`로 리플렉션하고(`backend/app/services/introspect.py:278`), `build_ddl`의 `CreateTable(table).compile()`은 `.schema`가 설정된 테이블을 `CREATE TABLE sales.orders` 형태로 **스키마 한정**해 출력한다. 그 결과 DBML key는 `sales.orders`가 된다.
2. **내부 모델은 이미 멀티 스키마를 담을 수 있다.** `DbmlTable.schema` 필드, `mergeDbml`의 `keyOf = ${schemaName ?? 'public'}.${name}`, 레이아웃 `LayoutPositions` 키가 모두 `${schema}.${table}` 한정이다. `public.users`와 `sales.users`는 충돌 없이 공존 가능하다. (E2E가 `public.project` 키를 쓰는 것과 일치.)

→ **그릇은 이미 멀티 스키마를 지원한다.** 변경은 (a) 입력을 단일→다중으로 넓히고, (b) Sync 삭제 범위를 "동기화한 스키마"로 한정하는 두 지점에 집중된다.

## 3. 결정

- DB Connection 자체를 **멀티 스키마**로 만든다 (대표+Sync 수동 조합 대신). 근거: PostgreSQL은 연결 하나가 DB 안의 모든 스키마를 보므로 스키마별 별도 연결이 불필요하고, 모델이 이미 스키마 한정이라 변경 표면이 작다.
- 사용자 패턴: **연결 후 DB의 스키마 목록을 조회 → 체크박스 다중 선택 → 한 번의 인트로스펙션.**
- 멀티 스키마는 **PostgreSQL 전용**이다. MariaDB는 DB 자체가 스코프(스키마 개념 없음)이므로 기존 단일 동작을 유지한다.
- **연결 정보는 계속 저장하지 않는다** (기존 일회성·보안 설계 유지). 재싱크 시 사용자가 연결 정보·스키마를 다시 입력/선택한다.
- **모델 변경이 없으므로 Alembic 마이그레이션은 불필요**하다 (DBML 텍스트와 레이아웃이 모든 구조를 담고, 연결 정보는 비저장).

## 4. 설계 (4개 파트)

### ① 백엔드 — 스키마 목록 조회 (신규)
- `services/introspect.py`에 `list_schemas(req) -> list[str]` 추가: 연결 후 PostgreSQL `information_schema.schemata`에서 시스템 스키마(`pg_*`, `information_schema`) 제외한 목록을 반환. MariaDB는 빈 목록.
- `POST /api/introspect/schemas` 라우트 추가. 얇게: 검증·DI만, 로직은 서비스에. 연결 정보(`IntrospectRequest`의 연결 부분)만 받아 목록 반환. (B1 준수: 라우트에서 ORM/쿼리 직접 사용 금지 — 외부 DB 조회는 서비스에.)

### ② 백엔드 — 다중 스키마 인트로스펙션
- `IntrospectRequest`: `db_schema: str | None` → `db_schemas: list[str]`로 확장(PostgreSQL용). 빈 리스트면 기존처럼 `public` 기본.
  - 하위호환이 필요하면 `db_schema`를 deprecated로 잠시 병행 수용할 수 있으나, 호출부가 프론트 단일 출처이므로 **단일 필드 교체를 기본**으로 한다(YAGNI).
- `introspect_to_ddl`: 선택 스키마마다 `metadata.reflect(bind=conn, schema=s)`를 **하나의 MetaData에 누적** 호출 → 스키마 한정 테이블이 모인다. 교차 스키마 FK도 함께 리플렉션돼 해소된다.
- 구현 주의 (동명 테이블 비충돌):
  - `_postgres_raw_type_names`를 스키마별로 호출하고, 키를 `(schema, table, column)`으로 병합.
  - `_patch_unknown_types`의 키도 `(table.name, column.name)` → `(table.schema, table.name, column.name)`으로 변경. 그러지 않으면 다른 스키마의 동명 테이블이 섞인다.
- `NoTablesFoundError`: 선택한 스키마 전체에서 테이블이 하나도 없을 때만 발생.

### ③ 프론트 — 스키마 다중 선택 UI
- `DbConnectDialog`: 연결 정보 입력 → "스키마 불러오기" 액션 → `/api/introspect/schemas` 호출 → **체크박스 다중 선택** 목록 표시.
- F1 준수: 체크박스/목록은 공용 토큰·최소 단위 컴포넌트로만. 호출부 인라인 스타일·매직넘버 금지.
- F4 준수: 새 문자열("스키마 불러오기", 선택 안내, 에러 등)은 **ko/en 양쪽**에 i18n 키를 먼저 추가한 뒤 `t()`로 소비. `data-testid`는 언어 무관 고정.
- 선택 스키마 배열을 `db_schemas`로 전송. (선택사항: 재싱크 시 프로젝트 DBML에 이미 존재하는 스키마를 기본 체크.)
- PostgreSQL일 때만 다중 선택 노출. MariaDB는 기존대로 스키마 입력 미노출.

### ④ 프론트 — DB Sync 삭제 범위 한정 (안전 수정, 핵심)
- `mergeDbml(current, incoming, syncedSchemas)`로 시그니처 확장.
- **삭제 대상을 `syncedSchemas`에 속한 스키마의 테이블로 한정**한다. 동기화하지 않은 스키마의 테이블은 절대 삭제하지 않는다.
  - 즉 결과 = (다른 스키마의 기존 테이블 그대로) + (동기화한 스키마는 `incoming`으로 교체, 메타데이터 보존).
  - 테이블 그룹·노트 등 기존 메타데이터 보존 로직은 유지하되, 그룹 멤버 필터링도 "동기화 스키마의 테이블 중 사라진 것"만 제거하도록 범위를 맞춘다.
- 호출부(`pages/editor/index.tsx`의 `applySync`)는 인트로스펙션에 사용한 `db_schemas`를 `syncedSchemas`로 전달.
- 근거: 이 한정이 없으면 부분 sync가 다른 스키마를 통째로 삭제하는 현재 동작이 멀티 스키마에서 그대로 재현된다.

## 5. 검증

- **백엔드** (`docker compose -p codegram exec -T backend pytest -q`):
  - 다중 스키마 리플렉션이 스키마 한정 DDL을 누적 생성한다.
  - 두 스키마의 동명 테이블이 섞이지 않는다(`_patch_unknown_types`/raw type 키 분리).
  - `list_schemas`가 시스템 스키마를 제외한다.
- **프론트 단위** (`cd frontend && npm run type-check && npm run test:run`):
  - `mergeDbml`가 `syncedSchemas` 밖 테이블을 보존하고, 안의 테이블만 교체/삭제한다.
- **E2E** (`cd frontend && VITE_PROXY_TARGET=http://localhost:4000 npx playwright test db-sync --project=chromium --reporter=line`):
  - 2개 스키마를 선택 적재 → 한쪽 스키마만 재싱크 시 다른 스키마 테이블이 보존된다.

## 6. 범위 밖 (YAGNI)

- 연결 정보 영속화(저장된 연결로 자동 재싱크). 기존 일회성·보안 설계 유지.
- MariaDB 다중 데이터베이스 스코프.
- 교차 스키마 관계의 시각적 특수 표현(스키마별 색/그룹 자동화). 필요해지면 별도 스펙.
