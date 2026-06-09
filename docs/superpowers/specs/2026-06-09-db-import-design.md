# DB 가져오기 / 동기화 설계

DB 커넥션으로 PostgreSQL·MariaDB의 스키마를 읽어 DBML을 만들고 auto-arrange로 ERD를 생성하는 기능. 두 페이즈로 나눈다.

- **Phase 1 — DB 가져오기(Import):** 외부 DB에 접속해 스키마를 읽어 **새 Project**로 ERD를 생성. (본 스펙에서 구현)
- **Phase 2 — DB 동기화(Sync):** 같은 접속 경로로 **기존 Project**의 구조를 갱신하되 수동 배치(위치)는 보존, 신규 테이블만 빈 공간에 배치. (개요만; 별도 grilling/스펙)

관련 결정: [ADR-0008](../../adr/0008-db-introspection-backend-reflection.md), [ADR-0002](../../adr/0002-frontend-dbml-parsing.md), [ADR-0004](../../adr/0004-layout-reconciliation-by-name.md), CONTEXT.md의 "DB 가져오기".

---

## 핵심 제약과 재사용

- 브라우저는 Postgres/MariaDB에 직접 TCP 접속 불가 → **DB 접속·introspection은 백엔드에서** 수행한다(신규 책임, ADR-0008).
- 백엔드는 reflection으로 **DDL만** 만들고, **DBML 변환은 프론트의 기존 `importSqlToDbml`(`@dbml/core`)** 가 한다(ADR-0002 유지).
- DBML 텍스트만 만들어내면 **ERD 렌더 + auto-arrange는 기존 경로로 자동** 처리된다(에디터가 `setDbmlText` 후 canvas가 재파싱, 빈 layout이면 dagre).
- TableGroup 자동 생성은 **범위 밖**(테이블+관계만 생성).

---

## Phase 1 — DB 가져오기 (Import)

### 사용자 흐름

```
[홈(ProjectList)] "Connect to Database" 버튼
  → DbConnectDialog: dialect / host / port / user / password / database / schema(PG) / SSL / 프로젝트명
  → POST /api/introspect  ──(백엔드)──▶ reflection → CreateTable + CreateIndex DDL
  ◀── { import_dialect: 'postgres'|'mysql', ddl }
  → importSqlToDbml(ddl, import_dialect)        (기존 @dbml/core 경로)
  → useCreateProject({ name, dbml_text })       (새 Project)
  → navigate(/editor/{id})  → 빈 layout → 첫 오픈 시 dagre auto-arrange
```

### 백엔드 (FastAPI)

신규 파일, 모델·테이블·마이그레이션 없음(transient).

- `app/schemas/introspect.py`
  - `IntrospectRequest`: `dialect: Literal["postgresql","mariadb"]`, `host: str`, `port: int`, `username: str`, `password: str`, `database: str`, `db_schema: str | None = None`(PG 기본 `public`, MariaDB 무시; `schema`는 pydantic `BaseModel` 속성을 가리므로 필드명은 `db_schema`로), `ssl: bool = False`.
  - `IntrospectResponse`: `import_dialect: Literal["postgres","mysql"]`, `ddl: str`, `table_count: int`.
- `app/services/introspect.py` — 순수 서비스(자체 DB 세션과 무관).
  1. dialect→sync 드라이버 URL 조립: `postgresql+psycopg2://…` / `mysql+pymysql://…`. SSL 옵션은 connect_args로(예: PG `sslmode=require`, MySQL `ssl={"ssl":{}}`).
  2. 요청마다 **동기 `create_engine`** 생성 → `inspect(engine)` reflection → 대상 schema의 테이블들을 `MetaData(schema=…)`로 reflect.
  3. 각 테이블 `CreateTable(table).compile(dialect=engine.dialect)`(PK·FK·UQ·NN 인라인) + 보조 인덱스 `CreateIndex(index)` → DDL 문자열로 concat.
  4. `engine.dispose()`.
  - 전체를 `anyio.to_thread.run_sync`로 실행(async 라우트 비차단).
  - 에러 분류: 연결 실패/인증 실패/타임아웃/테이블 없음 → 도메인 예외.
- `app/api/routes/introspect.py`
  - `POST /api/introspect`, `current_active_user` 인증 필요.
  - 성공 201/200 `IntrospectResponse`; 실패는 `4xx`(연결·인증·테이블없음) / `502`(대상 DB 오류)와 사용자용 메시지. **never-crash**: 서버 예외를 그대로 노출하지 않고 안전한 메시지로 매핑.
  - 라우터 등록은 기존 `app/api/router.py` 패턴을 따른다.
- 의존성 추가: `psycopg2-binary`, `PyMySQL` (pyproject + 이미지 rebuild 필요).
- dialect 매핑: PG→`import_dialect="postgres"`, MariaDB→`import_dialect="mysql"`(@dbml/core에 mariadb 전용 없음, MySQL 호환).

### 프론트엔드 (FSD)

- 신규 feature `features/db-import`
  - `ui/DbConnectDialog.tsx` — 접속 폼(위 필드). `shared/ui/dialog` 재사용. 에러는 다이얼로그 내부에 표시(기존 `SqlImportDialog` 패턴). **재사용 가능하게** 설계: 접속정보 수집 + `onIntrospected(ddl, import_dialect)` 콜백만 책임지고, "새 프로젝트 생성"은 상위에서 주입(Phase 2의 sync 오케스트레이션이 같은 다이얼로그를 재사용).
  - `api/useIntrospect.ts` — `POST /api/introspect` mutation(`shared/api/client`).
  - `model/types.ts` — 요청/응답 타입(백엔드 DTO 미러).
  - import 의존: `entities/dbml`(importSqlToDbml), `entities/project`(useCreateProject), `shared/ui`, `shared/api`. 모두 downward(FSD 준수).
- 진입점 합성: **`pages/home`** 이 `ProjectList`와 나란히 "Connect to Database" 버튼/다이얼로그를 렌더(feature→feature 금지 회피). 성공 시 `useCreateProject().mutateAsync({ name, dbml_text })` 후 `navigate(/editor/{id})`.
  - 대안 검토: `features/project-list` 안에 두면 project-list가 db-import에 의존(feature→feature) → 회피. 페이지 합성이 FSD상 옳다.
- 프로젝트명 기본값 = 입력한 `database` 이름(편집 가능).

### fidelity (best-effort — 기존 SQL import 스탠스 계승)

- 커버: 테이블, 컬럼, 타입, PK, FK, NOT NULL, UNIQUE, 보조 인덱스.
- 한계(누락 가능): PG `enum` 타입(`CREATE TYPE`), PG 컬럼/테이블 코멘트(MariaDB는 인라인 보존), 뷰·시퀀스·트리거·체크제약. `importSqlToDbml`가 일부 DDL을 못 파싱하면 never-throw로 에러 반환 → 다이얼로그에 표시.

### 보안

- 접속정보 transient(ADR-0008): 저장 안 함, 응답/로그에 비밀번호 미포함.
- SSRF 표면 존재 → 자체호스트 전제로 수용, 향후 allowlist 여지(ADR-0008).

### 테스트

- 백엔드 단위: (a) `MetaData`를 코드로 구성한 뒤 DDL 빌더가 CreateTable+CreateIndex를 올바르게 emit하는지(실DB 불필요), (b) dialect→import_dialect 매핑, (c) 에러 분류/HTTP 매핑.
- 백엔드 통합: docker 스택의 자체 Postgres(`user`/`project` 테이블)에 introspect → DDL/테이블 수 검증. MariaDB 라이브 테스트는 컨테이너 추가 비용 → best-effort(가능하면 추가, 아니면 단위로 커버).
- 프론트 단위: `DbConnectDialog` 폼·에러표시·성공시 콜백, `useIntrospect` 훅(요청/에러).
- E2E: 스택 자체 Postgres로 접속 → "Connect to Database" → 새 프로젝트 생성 → ERD 렌더 확인(기존 Playwright 패턴, autosave PATCH 대기 규약 준수).

### Phase 1 범위 밖 (YAGNI)

접속정보 저장, 라이브 동기화, 여러 schema 동시 introspect, TableGroup 자동 생성, 테이블 선택 UI, enum/뷰/시퀀스 완전 지원.

---

## Phase 2 — DB 동기화 (Sync) [개요 — 별도 스펙]

기존 Project의 구조를 DB 현재 상태로 갱신한다. **재사용:** Phase 1의 `/api/introspect` 엔드포인트 + `DbConnectDialog`(에디터에서 "Sync from DB" 진입).

기존 `reconcileLayout`(ADR-0004)이 이미 제공: 이름 일치 테이블은 좌표 유지, 삭제 테이블은 제거, 필드/관계 변경 반영. **남은 신규 작업과 미해결 결정:**

1. **신규 테이블 빈 공간 배치 (신규 알고리즘):** 현재 신규 노드는 full-graph dagre 좌표를 받아 기존 수동 배치와 **겹칠 수 있음**. 기존 노드 bounding box를 계산해 그 **바깥 빈 영역에 신규 노드만** 배치하는 전략 필요(권장: 인접 영역 그리드/서브-dagre, 복잡한 gap-packing은 지양). `entities/layout`/`entities/erd` 영역.
2. **Sync 의미론 (미해결, Phase 2 grilling 핵심):** DB introspection 결과로 DBML을 **전체 교체**하면 사용자가 DBML에 손으로 넣은 것(스티키 노트, 수동 TableGroup, headercolor, 손수 적은 Note)이 사라진다.
   - 옵션 A: 전체 교체(단순, 파괴적). 옵션 B: 구조만 머지하고 주석 보존(DBML diff/merge 필요, 어려움).
   - → Phase 2 진입 시 grill-with-docs로 결정한다.

---

## 산출물

- 신규 ADR-0008(작성됨), CONTEXT.md "DB 가져오기" 용어(반영됨).
- Phase 1 구현 plan(다음 단계: writing-plans).
