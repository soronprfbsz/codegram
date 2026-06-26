# 그룹별 테이블 정의서 Excel 설계 (+ MS SQL 방언 제거)

- 날짜: 2026-06-26
- 상태: 설계 승인됨 (구현 계획 대기)
- 관련: 직전 export 작업(exceljs 스타일 `tableDocStyle`, 워커 경로), `.claude/rules/frontend.md`(F1·F3·F4)
- 참고 샘플: `호크아이_postgresql_테이블정의서_v1.0.xlsm` — 제목/테이블목록/주제영역별 시트/용어사전 구조. 우리는 "주제영역" = **테이블 그룹**으로 대응.

## 1. 목적

테이블 정의서 **Excel 내보내기를 "테이블당 1시트"에서 "테이블 그룹당 1시트"로 교체**한다. 각 그룹 시트에 그 그룹 멤버 테이블들의 정의를 블록으로 쌓고, 맨 앞에 전체 "테이블 목록" 개요 시트를 둔다. (사용자 결정: 기존 Excel 항목을 교체. 충실도 = "중간" — 그룹 시트 구성과 개요 시트는 만들되 컬럼셋·스타일은 우리 기존 정의서 그대로, 표지/메타데이터·매크로·샘플 고유 컬럼셋은 제외.)

덤으로, **SQL 가져오기/내보내기에서 MS SQL Server 방언을 제거**한다(사용자 지시: Codegram은 PostgreSQL·MariaDB만 지원).

## 2. 핵심 사실 (코드 근거)

- `DbmlSchema.tableGroups: DbmlTableGroup[]`, 각 그룹 `{ name, color?, tables: string[] }` (멤버는 `${schema}.${table}` 키 = `DbmlTable.id`). `deriveTableDoc(schema)`는 스키마 전체를 받으므로 그룹 정보를 읽을 수 있다.
- 현재 `TableDocModel = { tables, enums }`. 평면 구조. 모든 빌더(xlsx/pdf/docx)가 이를 소비.
- Excel 빌더(`buildXlsx.ts`)는 exceljs 기반, 공용 스타일 `tableDocStyle`(헤더 `#3E6AE1`·흰글자·테두리·`STANDARD_COLUMN_WIDTHS`)와 시트명 클램프(31)/중복회피 헬퍼를 이미 가짐.
- SQL 방언은 `entities/dbml/model/sqlTypes.ts`의 `SqlDialect`/`SQL_DIALECTS`/`SQL_DIALECT_VALUES` 단일 출처. 소비처(ExportMenu의 SQL 항목, SqlImportDialog의 방언 선택)는 `SQL_DIALECT_VALUES`를 순회하므로 배열 축소 시 자동 반영. `mssql` 참조 테스트는 4곳뿐.

## 3. 결정

- **모델 확장(단일 출처)**: `TableDocModel`에 `groups: { name: string; tableIds: string[] }[]` 추가. `deriveTableDoc`가 `schema.tableGroups`에서 채움(멤버 순서 보존). 기존 `tables`/`enums`는 그대로 → **추가 필드라 docx/pdf 빌더는 무시**(영향 없음).
- **Excel만** 그룹별로 교체. DOCX/Word/PDF는 기존 평면 레이아웃 유지(모델 `groups` 무시).
- 그룹 미지정 테이블 → **"미분류" 시트**(존재할 때만). 그룹이 하나도 없으면 전부 미분류 1시트.
- MS SQL 방언 제거는 별도 태스크(기계적).

## 4. Excel 구조 (교체 후)

`buildTableDocXlsxBlob(model, labels): Promise<Blob>` — 시트 순서:
1. **테이블 목록**(개요): 헤더 `No · 그룹 · 테이블 · 설명`(스타일 적용). 한 행 = 한 테이블. `테이블` = `schema.name`, `그룹` = 속한 그룹명(없으면 "미분류"), `설명` = table note. 모든 테이블을 그룹 순서→그룹 내 순서로 나열.
2. **그룹당 1시트**(그룹 선언 순서): 시트명 = 그룹명(클램프 31·중복회피). 시트 안에 멤버 테이블을 블록으로 쌓음. 블록 레이아웃:
   - 굵은 제목 행: `schema.name` (note 있으면 ` — note`)
   - 컬럼 헤더 행(STANDARD_COLUMNS, 헤더 스타일)
   - 컬럼 데이터 행들(테두리)
   - (CHECK 있으면) 빈 행 → `CHECK 제약` 굵은 타이틀 → 헤더 → 행들 (기존 패턴)
   - 빈 구분 행 → 다음 테이블
   - 컬럼 너비는 `STANDARD_COLUMN_WIDTHS`.
3. **미분류** 시트(그룹 없는 테이블이 있을 때만): 위와 동일 블록 레이아웃.
4. **Enums** 시트(맨 끝, 기존과 동일).

데이터 흐름: `deriveTableDoc(schema)` → `TableDocModel`(이제 `groups` 포함) → 워커(`buildTableDocBlob('xlsx', …)`) → `buildTableDocXlsxBlob` → Blob → 다운로드. 진행 오버레이·폴백 기존 그대로.

## 5. 파일 (FSD)

- **Modify** `frontend/src/entities/table-doc/model/types.ts` — `TableDocModel.groups` 추가.
- **Modify** `frontend/src/entities/table-doc/lib/deriveTableDoc.ts` — `schema.tableGroups` → `groups` 도출(+ 반환에 포함).
- **Modify** `frontend/src/features/export-table-doc/lib/buildXlsx.ts` — 그룹별 구조로 교체(개요 시트 + 그룹 시트 + 미분류 + Enums). 블록 헬퍼(제목/컬럼표/CHECK)는 함수로 추출해 그룹·미분류 시트가 공유.
- **Modify** `frontend/src/features/export-table-doc/lib/buildXlsx.test.ts` — 새 구조 단언(되읽기).
- **Modify** `frontend/src/shared/i18n/locales/{ko,en}.json` — `tableDoc.overviewSheet`("테이블 목록"), `tableDoc.colNo`("No"), `tableDoc.colGroup`("그룹"), `tableDoc.colTable`("테이블"), `tableDoc.ungrouped`("미분류"). (`tableDoc.colNote`="설명"은 기존 재사용.)
- **MS SQL 제거**: `frontend/src/entities/dbml/model/sqlTypes.ts`(타입 union에서 `'mssql'` 제거, `SQL_DIALECTS`에서 mssql 항목 삭제, `SQL_DIALECT_VALUES`에서 제거). 테스트 갱신: `sqlImport.test.ts`/`sqlExport.test.ts`(mssql 케이스 삭제 또는 pg/mysql로), `downloadSql.test.ts`(mssql 파일명 케이스 삭제), `ExportMenu.test.tsx`('SQL · MS SQL Server' 기대 제거). 소비처(ExportMenu/SqlImportDialog)는 자동 축소.

## 6. 검증 (TDD)

- `deriveTableDoc`: 그룹→tableIds 도출, 미분류 분리, 멤버 순서 보존 단위 테스트.
- `buildXlsx`(exceljs 되읽기): (a) 그룹당 시트 존재 + 시트명, (b) "테이블 목록" 개요 시트의 그룹·테이블 행, (c) 그룹 없는 테이블의 "미분류" 시트, (d) 그룹 시트 내 테이블 블록(제목 행 + 컬럼 헤더 + 데이터), (e) 헤더 채우기색 `FF3E6AE1` 유지, (f) Enums 시트.
- MS SQL: `SQL_DIALECT_VALUES`에 `mssql` 없음, `SQL_DIALECTS`에 키 없음 단위 테스트; 갱신된 import/export/download 테스트 통과.
- E2E: `export.spec.ts`에서 Excel 다운로드가 여전히 비어있지 않음(구조 변경 반영). `sql.spec.ts`에 MS SQL 항목이 더는 없음(있으면 갱신).
- 명령: `cd frontend && npx vitest run <files>`; 타입 `npx tsc --noEmit --composite false --incremental false -p tsconfig.app.json`(루트 `npm run type-check`는 no-op); E2E `VITE_PROXY_TARGET=http://localhost:4000 npx playwright test export --project=chromium --reporter=line`.

## 7. 범위 밖 (YAGNI)

- 표지/문서 메타데이터 시트, 매크로(.xlsm), 샘플 고유 컬럼셋(No·컬럼ID·타입/길이 분리·KEY 합치기).
- 그룹별 DOCX/PDF/Word(이번엔 Excel만).
- 그룹 색상(`color`)을 시트 탭/헤더에 반영(추후).
