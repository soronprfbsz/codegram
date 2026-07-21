# ClickHouse 인트로스펙션은 구조화 컬럼(JSON)→프론트 DBML 생성으로 하고, 테이블·컬럼만 옮긴다

> **Status**: Accepted · **Tags**: `db-integration` · **Date**: 2026-07-21 · **Supersedes**: — · **Related**: ADR-0008, ADR-0002, ADR-0009

DB 가져오기·동기화(ADR-0008/0009)에 **ClickHouse**를 세 번째 연결 타입으로 추가한다. 단, ClickHouse는 기존 PostgreSQL·MariaDB와 **다른 경로**를 쓴다: 백엔드가 `system.tables`·`system.columns`를 조회해 **구조화된 테이블·컬럼 목록(JSON)**을 반환하고, 프론트가 그것으로 **DBML 텍스트를 직접 생성**한다(`@dbml/core` importer를 거치지 않는다). 결과 ERD는 **테이블 + 컬럼(타입·코멘트)만** 담으며, 관계선은 없다.

배경(왜 다른 경로인가):
- **ClickHouse엔 외래키(FK)가 없다.** ERD의 관계선을 만들 원천이 애초에 없으므로 "테이블+컬럼"이 ClickHouse에서 얻을 수 있는 자연스러운 최대치다.
- **`@dbml/core` importer가 ClickHouse DDL을 파싱하지 못한다.** importer는 postgres/mysql/mssql만 지원한다. 또한 ClickHouse 컬럼 타입(`LowCardinality(String)`, `Enum8('a' = 1, ...)`, `Map(K, V)`, `AggregateFunction(...)`, `Nullable(...)`)은 **타입 문자열 안에 콤마·괄호·따옴표**를 담아, 이를 `CREATE TABLE` DDL로 만들어 postgres 파서에 넣으면 컬럼 경계가 깨진다(실측). 단순 타입으로 뭉개야만 통과하므로 DDL 경로는 타입 정보를 잃는다.
- 반면 **타입 문자열을 따옴표로 감싼 DBML 텍스트**(`"col" "LowCardinality(String)"`)는 `@dbml/core` 파서가 그대로 받고 타입 원문을 손실 없이 보존한다(실측). 그래서 ClickHouse는 DDL을 우회하고 프론트에서 DBML을 직접 만든다.

이는 ADR-0008이 PostgreSQL·MariaDB에 대해 **기각**했던 "구조화 JSON → 프론트 신규 직렬화기" 경로다. 뒤집는 게 아니라, DDL→`@dbml/core` 경로가 **불가능한** ClickHouse에 한해 그 경로가 정답이 되는 **확장**이다. DBML 의미는 여전히 프론트에만 있으므로(백엔드는 구조화 목록까지만) ADR-0002 경계는 유지된다.

## Considered Options

### ClickHouse 스키마를 DBML로 옮기는 경로

- **구조화 컬럼(JSON) → 프론트 DBML 직접 생성 (채택)**: 백엔드가 `system.columns`에서 (테이블, 컬럼명, 타입 문자열, 코멘트)를 그대로 읽어 반환하고, 프론트의 신규 순수 함수가 타입을 따옴표로 보존해 DBML을 만든다. 타입 원문 100% 보존, FK 부재와 정합, `@dbml/core` 파싱 검증 완료. 비용은 ADR-0008이 지적한 대로 백/프론트 공유 계약 + 신규 직렬화기다.
- **SQLAlchemy reflection → DDL → `@dbml/core` (기존 경로 재사용) (기각)**: importer가 ClickHouse DDL을 파싱하지 못하고, 타입을 단순형으로 뭉개야만 통과해 정보를 잃는다. ClickHouse의 exotic 타입(`AggregateFunction` 등)은 reflection 자체도 불안정하다.
- **백엔드가 DBML 직접 생성 (기각)**: ADR-0002 위배(백엔드가 DBML을 "생산"). ADR-0008과 동일 사유로 기각.

### 접속 드라이버

- **`clickhouse-sqlalchemy` (HTTP dialect) (채택)**: 기존 `build_connection_url`→`create_engine`→`connect` **단일 접속 메커니즘**(ADR-0008의 엔진 모델)과 통일. `clickhouse+http` URL로 8123 인터페이스에 붙어 raw `text()` 쿼리로 system 테이블을 읽는다(reflection 미사용). 의존성이 다소 무겁다(clickhouse-driver 동반).
- **`clickhouse-connect` (기각)**: 공식·경량·HTTP 네이티브지만, `introspect.py`에 SQLAlchemy 엔진과 **다른 두 번째 접속 패러다임**을 들여 접속 코드가 갈린다.

### 대상 엔티티 범위

- **일반 테이블 + View/MaterializedView/Dictionary 포함, `.inner_id.*` 제외 (채택)**: 뷰·딕셔너리도 데이터 모델의 일부라 조망에 유용하고, 노이즈인 구체화뷰 내부 백킹 테이블(UUID 이름)만 걸러낸다.
- **일반 테이블만 (기각)**: 가장 깔끔하나 뷰·딕셔너리가 빠져 스키마 전체 조망을 잃는다.
- **전부(`.inner_id.*` 포함) (기각)**: UUID 이름의 내부 테이블이 노이즈.

## Consequences

- 신규 런타임 의존: `clickhouse-sqlalchemy`(+ clickhouse-driver). 접속은 기존과 동일하게 요청 본문의 접속정보로 1회용 아웃바운드(HTTP 8123 기본), 끝나면 dispose. 접속정보는 저장하지 않는다(ADR-0008/0006 유지). SSRF 표면도 기존과 동일 전제로 수용.
- **응답 계약이 dialect별로 갈린다**: PG/MariaDB는 종전대로 `ddl`(+`import_dialect`)을, ClickHouse는 구조화 `tables`를 반환한다. 프론트는 dialect로 분기해 ClickHouse만 새 DBML 생성기(`buildDbmlFromTables`)를 태우고, 그 외는 기존 `importSqlToDbml`을 유지한다. 이 신규 직렬화기가 유지 부담이다(ADR-0008이 예견한 비용).
- **DB 동기화(ADR-0009)는 자동으로 ClickHouse를 얻는다**: 같은 다이얼로그·`/api/introspect`를 재사용하고 sync는 DBML 텍스트를 다루므로, ClickHouse도 "전체 교체 + 이름 기반 Layout 보존"이 그대로 적용된다(관계 없는 테이블 집합의 diff).
- **도메인 언어 갱신**: `CONTEXT.md`의 **DB 가져오기** 정의가 "(PostgreSQL·MariaDB)"·"reflection으로 DDL을 만든다"로 못박혀 있었다. ClickHouse 추가로 (1) 대상 DB에 ClickHouse를 더하고, (2) 백엔드 산출물이 dialect별(DDL 또는 구조화 컬럼)이며 ClickHouse는 관계 없는 테이블·컬럼만 옮긴다는 사실을 반영한다. "한 번의 가져오기는 한 schema 대상"에서 ClickHouse의 schema는 **접속한 database**다(MariaDB와 동형).
- **범위 밖**: 관계선 추론(FK 부재), 다중 database(스키마) 선택 UI(접속 database 하나만 대상), 뷰의 정의 SQL·파티션/정렬키·엔진 파라미터 등 구조 외 메타데이터(엔진명만 테이블 note로 보존). fidelity는 기존과 같은 best-effort.
