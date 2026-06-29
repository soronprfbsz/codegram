# 엑셀 테이블정의서 양식 (테이블별 블록) — 설계

날짜: 2026-06-29
범위: `frontend/src/features/export-table-doc/lib/buildXlsx.ts` (엑셀 내보내기만). PDF·Word·미리보기는 현재 형식 유지.

## 배경 / 목표
엑셀 "테이블 정의서" 출력에서, 각 테이블을 사내 표준 "테이블정의서" 양식(상단 메타 그리드 + 본문 컬럼 표)으로 출력한다. 기존 엑셀은 테이블마다 `제목 + 표준 컬럼표(컬럼명/데이터타입/PK/FK/NN/UNIQUE/기본값/설명)`를 쌓았는데, 이를 새 양식 블록으로 교체한다.

## 시트 구조 (현행 유지)
- `[개요]` 시트: 변경 없음 (No./그룹/테이블/설명).
- 그룹별 시트: 그룹에 속한 테이블들을 새 양식 블록으로 세로로 쌓음.
- `[미분류]` 시트: 그룹 미소속 테이블 (있을 때만).
- `[Enums]` 시트: 변경 없음.

## 테이블 1개 블록 (8열 A–H)
1. **제목행**: `테이블정의서` — A:H 병합, 회색 채움, 가운데, 굵게.
2. **메타행 1**: A=`주제영역명`(라벨), B:D=값 / E=`테이블명`(라벨), F:H=값.
3. **메타행 2**: A=`DB 명`(라벨), B:D=값 / E=`스키마명`(라벨), F:H=값.
4. **메타행 3**: A=`테이블설명`(라벨), B:H=값(병합).
5. **컬럼 헤더행**: `No. | 컬럼ID | 타입 | 길이 | NULL | KEY | DEFAULT | 설명` — 회색 채움, 굵게.
6. **컬럼 행들**: 테이블 컬럼마다 1행, 테두리.
7. (CHECK 제약이 있으면) 컬럼 표 아래에 CHECK 하위표 유지: `이름 | 허용값 | 표현식`.
8. **기타행**: A=`기타`(라벨), B:H=값(병합, 빈칸).
9. 테이블 간 빈 줄 1행으로 구분.

라벨 셀(주제영역명/DB 명/스키마명/테이블명/테이블설명/기타/컬럼 헤더)은 공용 헤더 스타일(`HEADER_FILL`/`HEADER_TEXT` + 테두리)을 쓴다.

## 데이터 매핑
| 칸 | 출처 |
|---|---|
| 주제영역명 | 테이블 그룹명 (미소속 → `미분류` 라벨) |
| 테이블명 | `table.name` (기술명) |
| DB 명 | `table.schema`를 **첫 `_`** 로 분리한 앞부분 (`_` 없으면 빈칸) |
| 스키마명 | 첫 `_` 뒷부분 (`_` 없으면 schema 전체) |
| 테이블설명 | `table.note` |
| No. | 1부터 순번 |
| 컬럼ID | `column.name` |
| 타입 | `column.type`의 `(` 앞 부분 (예: `varchar(50)` → `varchar`) |
| 길이 | `(` 안 내용 (예: `50`; 괄호 없으면 빈칸) |
| NULL | `notNull` → `NOT NULL`, 아니면 빈칸 |
| KEY | `pk`→`PK`, `unique`→`UK`, `fk`→`FK` 를 순서 `PK,UK,FK` 로 콤마 결합 |
| DEFAULT | `column.default` (없으면 빈칸) |
| 설명 | `column.note` |

비고: `column.type`은 파서가 `type_name`(괄호 포함, 예 `varchar(255)`)을 그대로 저장하므로 길이를 괄호 분리로 얻는다. 타입 대소문자는 원문 유지.

## i18n
새 라벨 키를 `tableDoc.*` 에 ko/en 양쪽 추가하고 `TableDocLabels`/`tableDocLabels()`로 노출:
`docTitle`(테이블정의서/Table Definition), `subjectArea`(주제영역명/Subject Area), `dbName`(DB 명/DB Name), `schemaName`(스키마명/Schema), `tableName`(테이블명/Table Name), `tableDesc`(테이블설명/Description), `colNo`(No.; 기존 재사용), `colId`(컬럼ID/Column ID), `colTypeName`(타입/Type), `colLength`(길이/Length), `colNull`(NULL/NULL), `colKey`(KEY/KEY), `colDefaultVal`(DEFAULT/DEFAULT), `colDesc`(설명/Description; 기존 `colNote` 재사용 가능), `etc`(기타/Other).
(기존 키와 의미가 겹치면 재사용; 새로 필요한 것만 추가.)

## 구현 메모
- 엑셀 전용 셀 매핑(타입/길이 분리, KEY 결합, schema 분리)은 `buildXlsx.ts` 로컬 헬퍼로 둔다(다른 포맷이 쓰지 않으므로). 순수 함수로 분리해 단위 테스트.
- 기존 `writeTableBlock`을 새 양식으로 교체. `columnRow`/`STANDARD_COLUMN_WIDTHS` 의존 제거(엑셀에서 미사용 시 정리, 단 다른 포맷이 공용으로 쓰면 유지).
- 검증: `npm run type-check`, `npm run test:run`(buildXlsx 테스트 갱신/추가).
```

## 결정 로그
- DB/스키마: 첫 `_` 분리. 주제영역명: 그룹명. 컬럼명 칸 제거·비고→설명. 테이블명=기술명. 시트=그룹별 쌓기. CHECK 하위표 유지. 타입 원문 유지. (사용자 승인 2026-06-29)
