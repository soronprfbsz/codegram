# DB 인트로스펙션: 백엔드가 외부 DB에 접속해 reflection→DDL을 수행하고 접속정보는 1회용으로 둔다

실행 중인 외부 PostgreSQL·MariaDB에 접속해 스키마를 가져와 ERD를 만드는 "DB 가져오기"(CONTEXT.md 참조)를 위해, 백엔드(FastAPI)가 사용자가 제출한 접속정보로 외부 DB에 **아웃바운드 접속**하여 SQLAlchemy reflection으로 스키마를 읽고 `CreateTable`/`CreateIndex`로 **DDL 문자열**을 만들어 프론트에 반환한다. 프론트는 기존 `@dbml/core` importer(`importSqlToDbml`)로 DDL→DBML 변환을 수행한다. 접속정보(호스트·포트·유저·비밀번호·DB·schema)는 요청 본문으로만 받아 1회 사용 후 폐기하며 **저장하지 않는다**(전용 테이블·마이그레이션 없음).

## Considered Options

- **출력 형식**
  - **DDL 추출 → 프론트 `@dbml/core` (채택)**: 검증된 SQL-import 경로를 그대로 재사용하고, DBML 의미는 프론트 공식 파서에만 유지되어 ADR-0002와 일관하며, 신규 코드가 최소다.
  - 구조화 JSON → 프론트 신규 직렬화기 (기각): DBML은 프론트에 남지만 새 직렬화기 + 백/프론트 공유 계약을 새로 만들어 유지해야 한다.
  - 백엔드가 DBML 직접 생성 (기각): 백엔드가 DBML을 "생산"하게 되어 ADR-0002 위배.
- **DDL 생성 수단**
  - **드라이버 + SQLAlchemy reflection/`CreateTable` (채택)**: 추가 바이너리 없음, PG/MariaDB 단일 코드 경로, `pg_dump` 서버-버전 호환 거부 문제 회피. fidelity는 best-effort.
  - `pg_dump`/`mysqldump` 바이너리 (기각): importer가 본래 이 출력용으로 설계되어 fidelity는 최고지만, 클라이언트 바이너리 동봉·버전 호환·subprocess/비밀번호 전달 부담.
- **접속정보 보관**
  - **Transient — 저장 안 함 (채택)**: 시크릿 at-rest·암호화 키 관리 책임을 회피하고, "공유 없음·얇은 백엔드"(ADR-0006) 경계와 일관. 가져오기는 1회성이라 재접속 빈도가 낮다.
  - 접속 프로필 저장 (기각, 향후 가능): 재사용 편의↑이나 암호화·키관리 표면이 추가된다.

## Consequences

- 백엔드가 처음으로 **외부로 아웃바운드 DB 접속**을 수행한다 — ADR-0002/0006의 "얇은 영속화 계층" 전제를 넓힌다. 다만 DBML 의미는 여전히 프론트에만 있다(백엔드는 DDL까지만 만든다).
- 신규 런타임 의존: `psycopg2-binary`, `PyMySQL`. SQLAlchemy reflection은 동기 API이므로 요청마다 동기 엔진을 만들어 `anyio.to_thread`(threadpool)에서 실행하고 끝나면 dispose한다(async 이벤트 루프 비차단).
- 사용자 지정 호스트로 접속하므로 **SSRF 표면**이 생긴다. 자체호스트·단일 조직 운영 전제에서 수용하며, 필요 시 향후 호스트 allowlist/네트워크 정책을 추가한다(되돌리기 비용 낮음).
- fidelity는 **best-effort**: 테이블·컬럼·타입·PK·FK·NN·UQ·보조 인덱스를 커버한다. PG enum 타입(`CREATE TYPE`)·PG 컬럼 코멘트·뷰·시퀀스·트리거 등은 누락될 수 있다. 이는 기존 SQL import의 never-throw·best-effort 스탠스와 일관한다.
- 동기화(Phase 2)는 이 엔드포인트를 재사용한다. 본 ADR은 "백엔드가 스키마를 읽어 DDL을 만든다"까지를 다루며, sync의 layout 배치·DBML 머지 의미론은 별도 결정으로 남긴다.
