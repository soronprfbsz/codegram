# ClickHouse 연결 타입 추가 — 설계 (테이블·컬럼 ERD 자동 생성)

- 날짜: 2026-07-21
- 결정 기록: ADR-0021 (Related: ADR-0008 인트로스펙션, ADR-0002 프론트 DBML, ADR-0009 동기화)
- 목표: DB 가져오기·동기화에 **ClickHouse**를 세 번째 연결 타입으로 추가해, 실행 중인 ClickHouse의 스키마를 읽어 **테이블+컬럼** ERD를 자동 생성한다(관계선 없음).

## 배경 / 실측 근거

기존 파이프라인(ADR-0008): 프론트 접속 다이얼로그 → `POST /api/introspect` → 백엔드 SQLAlchemy reflection → **DDL 문자열** → 프론트 `@dbml/core` importer로 DDL→DBML → ERD.

ClickHouse는 이 파이프라인을 그대로 탈 수 없다. 실측으로 확정한 사실:

1. **연결/조회 가능** — `10.140.1.40:8123`(HTTP) 인증 접속 OK(ClickHouse 24.8), `system.tables`/`system.columns`로 테이블·컬럼·타입·코멘트를 깔끔히 조회(대상 DB `hawkeye`에 86개 엔티티: MergeTree 계열/View/MaterializedView/Dictionary/`.inner_id.*`).
2. **FK 없음** — ClickHouse엔 외래키가 없어 관계선 원천이 없다 → 테이블+컬럼이 자연스러운 최대치.
3. **DDL→@dbml/core 불가** — importer는 postgres/mysql/mssql만 지원. ClickHouse 타입(`LowCardinality(String)`, `Enum8('operational' = 1, ...)`, `Map(LowCardinality(String), String)`, `AggregateFunction(avgIf, Float64, UInt8)`, `Nullable(...)`)은 타입 문자열 안에 콤마·괄호·따옴표가 있어, `CREATE TABLE` DDL로 만들어 postgres 파서에 넣으면 컬럼 경계가 깨진다. 단순 타입으로 뭉개야 통과 → 타입 손실.
4. **DBML 직접 생성은 통과** — 타입을 따옴표로 감싼 DBML(`"col" "LowCardinality(String)"`)을 `@dbml/core` 파서(`Parser().parse(dbml, 'dbmlv2')`)에 넣으면 그대로 파싱되고 타입 원문이 손실 없이 보존됨(실측 Test A).

결론: ClickHouse는 **백엔드가 구조화 컬럼(JSON)을 반환 → 프론트가 DBML을 직접 생성**하는 경로를 쓴다. DBML 의미는 프론트에만 유지되어 ADR-0002 경계는 지켜진다.

## 아키텍처 (ClickHouse 전용 분기)

```
DbConnectDialog (dialect='clickhouse')
  → POST /api/introspect  { dialect:'clickhouse', host, port:8123, username, password, database, ssl }
  → 백엔드: clickhouse-sqlalchemy(http) 엔진 → system.tables/system.columns 조회
           → IntrospectResponse { dialect:'clickhouse', tables:[{name, engine, columns:[{name,type,comment}]}] }
  → 프론트: buildDbmlFromTables(tables)  → DBML 텍스트 (타입 따옴표 보존, FK 없음)
  → 이후 프로젝트 생성 / 동기화 / ERD 렌더는 기존과 동일 (DBML 텍스트만 소비)
```

PG/MariaDB 경로는 **그대로**(reflection→DDL→`importSqlToDbml`). ClickHouse만 additive 분기.

## 컴포넌트별 변경

### 백엔드 (`backend/`)

1. **의존성** (`pyproject.toml`): `clickhouse-sqlalchemy` 추가(HTTP dialect, clickhouse-driver 동반). ADR-0021은 이 신규 의존을 기록한다.
2. **스키마** (`app/schemas/introspect.py`):
   - `IntrospectRequest.dialect`: `Literal["postgresql", "mariadb", "clickhouse"]`.
   - `IntrospectResponse`: 구조화 결과를 담을 선택적 필드 추가 — `tables: list[IntrospectedTable] | None`(ClickHouse 전용), 기존 `ddl`/`import_dialect`와 공존. 신규 모델 `IntrospectedTable{ name: str, engine: str | None, columns: list[IntrospectedColumn] }`, `IntrospectedColumn{ name: str, type: str, comment: str | None }`.
3. **접속 URL** (`app/services/introspect.py`):
   - `_DRIVERNAME`에 `"clickhouse": "clickhouse+http"` 추가.
   - `build_connection_url`: clickhouse 기본 포트 8123, SSL 시 https 프로토콜/파라미터 분기.
4. **인트로스펙션 분기**:
   - `introspect_to_ddl`(또는 상위 진입점)에서 `dialect == "clickhouse"`면 reflection/DDL을 건너뛰고 신규 `introspect_clickhouse(engine, database)` 호출.
   - `introspect_clickhouse`: `text()` raw SQL로
     - 테이블: `SELECT name, engine FROM system.tables WHERE database = :db AND name NOT LIKE '.inner_id.%' ORDER BY name`
     - 컬럼: `SELECT table, name, type, comment FROM system.columns WHERE database = :db AND table NOT LIKE '.inner_id.%' ORDER BY table, position`
     - 두 결과를 조립해 `list[IntrospectedTable]` 반환(엔진→`engine`, 코멘트 빈 문자열→None).
   - 엔티티 범위: MergeTree 계열 + View/MaterializedView/Dictionary 포함, `.inner_id.*` 제외(ADR-0021 채택안).
5. **`list_schemas`**: clickhouse는 `[]` 반환(MariaDB와 동일 — 접속 database가 곧 스코프, 스키마 선택 UI 없음).
6. **라우트** (`app/api/routes/introspect.py`): 응답에 `tables`가 실릴 뿐 시그니처 변화 없음. threadpool 실행·`require_password_ok` 인증 그대로.

### 프론트엔드 (`frontend/`)

1. **타입** (`features/db-import/model/types.ts`): `IntrospectDialect = 'postgresql' | 'mariadb' | 'clickhouse'`. `IntrospectResponse` 미러에 `tables?` 추가(백엔드 모델과 동형).
2. **DBML 생성기** (신규 `entities/dbml/lib/buildDbmlFromTables.ts`): 순수 함수. 입력 `IntrospectedTable[]` → DBML 텍스트.
   - 테이블명·컬럼명·타입은 항상 큰따옴표로 감싸고 내부 `"`를 이스케이프.
   - 컬럼 코멘트 → `[note: '...']`(작은따옴표 이스케이프), 엔진 → 테이블 `Note`(선택).
   - FK/Ref/인덱스 없음. 빈 테이블(컬럼 0개)도 유효 DBML로 방출.
   - ADR-0002 준수: DBML 생성은 프론트 entities 계층에 둔다(`@dbml/core` import 지점 옆).
3. **연결 플로우 분기** (`features/db-import` 및 `pages/editor`에서 introspect 결과 소비부): `response.dialect === 'clickhouse'`면 `buildDbmlFromTables(response.tables)`, 그 외는 기존 `importSqlToDbml(response.ddl, response.import_dialect)`.
4. **다이얼로그** (`features/db-import/ui/DbConnectDialog.tsx`):
   - dialect select에 `ClickHouse` 옵션(shadcn Select 항목).
   - `DEFAULT_PORT`에 `clickhouse: 8123`.
   - 스키마 선택 UI는 `dialect === 'postgresql'` 조건이라 clickhouse에선 자동 미노출(MariaDB와 동일). connect 시 `db_schemas` 미전달.
   - 사용자 노출 문자열은 F4에 따라 i18n 키로(옵션 라벨은 고정 브랜드명이라 필요 최소).

### 도메인 문서 (`CONTEXT.md`)

- **DB 가져오기** 정의(69–71행) 갱신: 대상 DB에 ClickHouse 추가; 백엔드 산출물이 dialect별(PG/MariaDB=DDL, ClickHouse=구조화 컬럼)이며 ClickHouse는 **관계 없는 테이블·컬럼만** 옮긴다는 점; ClickHouse의 schema는 접속 database임을 명시. (ADR-0021에 이 언어 변경을 기록함.)

## 테스트 / 검증 (G3)

- **선결**: `deploy/scripts/start.sh`로 codegram 스택 기동(현재 미기동). 백엔드 4000 / 프론트 4001 / pg 35432.
- **드라이버 스모크(구현 1단계)**: 백엔드 컨테이너에서 `clickhouse-sqlalchemy`로 `clickhouse+http://hawkeye:***@10.140.1.40:8123/hawkeye` 접속 → `system.tables` 1행 조회 성공 확인. (여기서 막히면 드라이버를 `clickhouse-connect`로 대체 — ADR-0021 기각안 복귀, 재승인.)
- **백엔드 단위**(`backend/tests/`): `introspect_clickhouse`가 (테이블, 엔진, position 순 컬럼) 조립 정확, `.inner_id.*` 제외, 코멘트 빈문자→None. `build_connection_url` clickhouse URL·기본포트. (system 응답은 픽스처/모킹.)
- **프론트 단위**(vitest): `buildDbmlFromTables` — 복합 타입 따옴표 보존, 이스케이프, 빈 테이블, 코멘트→note. **생성한 DBML을 `@dbml/core` `Parser`로 재파싱해 왕복 검증**(실측 Test A를 테스트로 고정).
- **타입/린트**: `cd frontend && npm run type-check`, `npm run test:run`; `docker compose -p codegram exec -T backend pytest -q`.
- **E2E(실측)**: 스택 기동 후, DbConnectDialog에서 ClickHouse 선택→`10.140.1.40:8123`/`hawkeye` 접속→프로젝트 생성→ERD에 테이블 카드·컬럼·타입이 렌더되고 `.inner_id.*`가 없음을 Playwright로 확인.

## 범위 밖 (명시)

- 관계선 추론(FK 부재), 다중 database(스키마) 선택기, 뷰 정의 SQL·파티션/정렬키/엔진 파라미터 등 구조 외 메타데이터(엔진명만 note), 접속 프로필 저장(ADR-0008 유지).
- DB 동기화(ADR-0009)는 같은 다이얼로그·엔드포인트를 재사용하므로 ClickHouse를 **자동으로** 얻는다 — 별도 작업 없음(DBML 기반 diff).
