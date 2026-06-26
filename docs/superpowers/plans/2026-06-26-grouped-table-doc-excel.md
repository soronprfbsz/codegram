# 그룹별 테이블 정의서 Excel (+ MS SQL 제거) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 테이블 정의서 Excel을 "테이블당 1시트"에서 "테이블 그룹당 1시트(+ 전체 목록 개요 + 미분류)"로 교체하고, SQL 가져오기/내보내기에서 MS SQL 방언을 제거한다.

**Architecture:** `TableDocModel`에 그룹 정보를 추가하고 `deriveTableDoc`가 `schema.tableGroups`에서 채운다(추가 필드라 docx/pdf는 무시). exceljs 기반 `buildTableDocXlsxBlob`을 그룹별 구조로 다시 쓰되 공용 스타일(`tableDocStyle`)·시트명 헬퍼·테이블 블록 헬퍼를 재사용한다. MS SQL은 `sqlTypes.ts` 단일 출처에서 제거하면 소비처가 자동 축소된다.

**Tech Stack:** React + Vite + TypeScript, exceljs, react-i18next, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-26-grouped-table-doc-excel-design.md`

## Global Constraints

- 단일 출처(G1/F1): 모든 export는 `TableDocModel` + `STANDARD_COLUMNS`/`columnRow` + `tableDocLabels` + 공용 `tableDocStyle` 상수를 소비. 컬럼/색/너비 재정의 금지.
- 헤더 스타일: 배경 `#3E6AE1`, 흰글자, 굵게, 테두리 `#D1D5DB` (exceljs ARGB `FF…`). 컬럼 너비는 `STANDARD_COLUMN_WIDTHS`.
- Excel만 그룹별. DOCX/Word/PDF는 평면 유지(모델 `groups` 무시).
- 그룹 미지정 테이블 → "미분류" 시트(있을 때만). 그룹 0개면 전부 미분류.
- F4 i18n: 신규 문자열은 ko/en 양쪽에 키 추가 후 `t()`로만.
- MS SQL 제거 후 Codegram은 `postgres`·`mysql`만 지원.
- 검증: `cd frontend && npx vitest run <files>`; 타입 `npx tsc --noEmit --composite false --incremental false -p tsconfig.app.json`(루트 `npm run type-check`는 사전 no-op); E2E `VITE_PROXY_TARGET=http://localhost:4000 npx playwright test export --project=chromium --reporter=line`.

---

## File Structure

- **Modify** `frontend/src/entities/table-doc/model/types.ts` — `TableDocModel.groups`.
- **Modify** `frontend/src/entities/table-doc/lib/deriveTableDoc.ts` — derive `groups`.
- **Modify** `frontend/src/entities/table-doc/lib/deriveTableDoc.test.ts` — group derivation test.
- **Modify** `frontend/src/features/export-table-doc/lib/labels.ts` — overview/ungrouped labels.
- **Modify** `frontend/src/features/export-table-doc/lib/buildXlsx.ts` — grouped structure.
- **Modify** `frontend/src/features/export-table-doc/lib/buildXlsx.test.ts` — grouped-structure asserts.
- **Modify** `frontend/src/shared/i18n/locales/{ko,en}.json` — new `tableDoc.*` keys.
- **Modify** `frontend/src/entities/dbml/model/sqlTypes.ts` — drop `mssql`.
- **Modify** `frontend/src/entities/dbml/lib/sqlImport.test.ts`, `sqlExport.test.ts`, `frontend/src/features/sql-export/lib/downloadSql.test.ts`, `frontend/src/widgets/export-menu/ui/ExportMenu.test.tsx` — drop mssql cases.
- **Modify** `frontend/e2e/export.spec.ts` — Excel still non-empty.

---

## Task 1: `TableDocModel.groups` + `deriveTableDoc`

**Files:**
- Modify: `frontend/src/entities/table-doc/model/types.ts`
- Modify: `frontend/src/entities/table-doc/lib/deriveTableDoc.ts`
- Test: `frontend/src/entities/table-doc/lib/deriveTableDoc.test.ts`

**Interfaces:**
- Produces: `TableDocModel.groups: { name: string; tableIds: string[] }[]` (group declaration order, member ids = `${schema}.${table}`). `deriveTableDoc(schema)` populates it from `schema.tableGroups`.

- [ ] **Step 1: 실패 테스트 작성**

`deriveTableDoc.test.ts`에 추가(파일 상단의 기존 schema 빌더 헬퍼 사용; 없으면 최소 schema 리터럴 구성). 그룹과 멤버 순서를 검증:

```ts
import { deriveTableDoc } from './deriveTableDoc'
import type { DbmlSchema } from '@/entities/dbml'

it('surfaces table groups with member ids in declared order', () => {
  const schema = {
    tables: [
      { id: 'public.a', schema: 'public', name: 'a', columns: [], note: '', checks: [] },
      { id: 'public.b', schema: 'public', name: 'b', columns: [], note: '', checks: [] },
      { id: 'public.c', schema: 'public', name: 'c', columns: [], note: '', checks: [] },
    ],
    refs: [],
    enums: [],
    tableGroups: [{ name: 'core', tables: ['public.b', 'public.a'] }],
    notes: [],
  } as unknown as DbmlSchema

  const model = deriveTableDoc(schema)
  expect(model.groups).toEqual([{ name: 'core', tableIds: ['public.b', 'public.a'] }])
})

it('returns an empty groups array when there are no table groups', () => {
  const schema = { tables: [], refs: [], enums: [], tableGroups: [], notes: [] } as unknown as DbmlSchema
  expect(deriveTableDoc(schema).groups).toEqual([])
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/entities/table-doc/lib/deriveTableDoc.test.ts -t "table groups"`
Expected: FAIL — `model.groups` is undefined (property missing).

- [ ] **Step 3: 모델 타입에 groups 추가**

`types.ts`의 `TableDocModel`:

```ts
export interface TableDocModel {
  tables: TableDocTable[]
  enums: TableDocEnum[]
  /** Table groups (declaration order); member ids are `${schema}.${table}`.
   *  Only the grouped Excel export uses this; other formats ignore it. */
  groups: { name: string; tableIds: string[] }[]
}
```

- [ ] **Step 4: deriveTableDoc에서 groups 채우기**

`deriveTableDoc.ts`의 `return { tables, enums }`를 교체:

```ts
  const groups = schema.tableGroups.map((g) => ({
    name: g.name,
    tableIds: [...g.tables],
  }))

  return { tables, enums, groups }
```

- [ ] **Step 5: 통과 확인**

Run: `cd frontend && npx vitest run src/entities/table-doc/lib/deriveTableDoc.test.ts`
Expected: PASS (기존 + 신규 2개). 다른 `deriveTableDoc` 테스트가 `{ tables, enums }` 전체 동등비교를 한다면 `groups: []`를 기대에 추가.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/entities/table-doc/model/types.ts frontend/src/entities/table-doc/lib/deriveTableDoc.ts frontend/src/entities/table-doc/lib/deriveTableDoc.test.ts
git commit -m "feat(table-doc): carry table groups in the derived model"
```

---

## Task 2: 그룹별 Excel 빌더 (+ labels + i18n)

**Files:**
- Modify: `frontend/src/features/export-table-doc/lib/labels.ts`
- Modify: `frontend/src/shared/i18n/locales/ko.json`, `en.json`
- Modify: `frontend/src/features/export-table-doc/lib/buildXlsx.ts`
- Test: `frontend/src/features/export-table-doc/lib/buildXlsx.test.ts`

**Interfaces:**
- Consumes: `TableDocModel.groups` (Task 1); `tableDocStyle` constants; `columnRow`/`TableDocTable`.
- Produces: `TableDocLabels` gains `overviewSheet`, `overviewNo`, `overviewGroup`, `overviewTable`, `overviewDesc`, `ungroupedSheet`. `buildTableDocXlsxBlob(model, labels): Promise<Blob>` emits overview + per-group + ungrouped + enums sheets.

- [ ] **Step 1: i18n 키 추가 (ko + en 양쪽)**

`ko.json`의 `tableDoc` 객체에 추가: `"overviewSheet": "테이블 목록"`, `"colNo": "No"`, `"colGroup": "그룹"`, `"colTable": "테이블"`, `"ungrouped": "미분류"`.
`en.json`의 `tableDoc`에 추가: `"overviewSheet": "Table list"`, `"colNo": "No"`, `"colGroup": "Group"`, `"colTable": "Table"`, `"ungrouped": "Ungrouped"`.
(`tableDoc.colNote`는 이미 존재 — 개요의 "설명" 열에 재사용.)
검증: `cd frontend && node -e "require('./src/shared/i18n/locales/ko.json'); require('./src/shared/i18n/locales/en.json'); console.log('json ok')"`.

- [ ] **Step 2: labels 확장**

`labels.ts`의 `TableDocLabels`에 필드 추가:

```ts
  /** Overview ("테이블 목록") sheet name + its column headers. */
  overviewSheet: string
  overviewNo: string
  overviewGroup: string
  overviewTable: string
  overviewDesc: string
  /** Sheet name for tables not in any group. */
  ungroupedSheet: string
```

그리고 `tableDocLabels(t)` 반환에 추가:

```ts
    overviewSheet: t('tableDoc.overviewSheet'),
    overviewNo: t('tableDoc.colNo'),
    overviewGroup: t('tableDoc.colGroup'),
    overviewTable: t('tableDoc.colTable'),
    overviewDesc: t('tableDoc.colNote'),
    ungroupedSheet: t('tableDoc.ungrouped'),
```

- [ ] **Step 3: 실패 테스트 작성 (그룹별 구조 되읽기)**

`buildXlsx.test.ts`를 그룹 구조 검증으로 갱신. 기존 LABELS 객체에 새 필드를 더하고, 그룹/미분류가 있는 모델로 검증:

```ts
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import type { TableDocModel } from '@/entities/table-doc'
import { buildTableDocXlsxBlob } from './buildXlsx'
import type { TableDocLabels } from './labels'
import { HEADER_FILL } from './tableDocStyle'

const LABELS: TableDocLabels = {
  columnHeaders: ['컬럼명', '데이터타입', 'PK', 'FK', 'NN', 'UNIQUE', '기본값', '설명'],
  fkColumn: '컬럼', fkReference: '참조',
  enumColEnum: 'Enum', enumColValue: '값', enumColNote: '설명', enumsSheet: 'Enums',
  checks: 'CHECK 제약', checkName: '이름', checkValues: '허용값', checkExpression: '표현식',
  overviewSheet: '테이블 목록', overviewNo: 'No', overviewGroup: '그룹',
  overviewTable: '테이블', overviewDesc: '설명', ungroupedSheet: '미분류',
}

function tbl(schema: string, name: string, note = ''): TableDocModel['tables'][number] {
  return {
    id: `${schema}.${name}`, schema, name, note,
    columns: [{ name: 'id', type: 'int', pk: true, fk: false, notNull: true, unique: false, default: '', note: '' }],
    fkTargets: [], checks: [],
  }
}

const model: TableDocModel = {
  tables: [tbl('public', 'users', 'app users'), tbl('public', 'roles'), tbl('public', 'loose')],
  enums: [{ id: 'public.k', schema: 'public', name: 'k', note: '', values: [{ name: 'a', note: '' }] }],
  groups: [{ name: '사용자관리', tableIds: ['public.users', 'public.roles'] }],
}

async function read(blob: Blob): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await blob.arrayBuffer())
  return wb
}

describe('buildTableDocXlsxBlob (grouped)', () => {
  it('creates an overview sheet, a sheet per group, an Ungrouped sheet, and Enums', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    expect(wb.getWorksheet('테이블 목록')).toBeTruthy()
    expect(wb.getWorksheet('사용자관리')).toBeTruthy()
    expect(wb.getWorksheet('미분류')).toBeTruthy()
    expect(wb.getWorksheet('Enums')).toBeTruthy()
  })

  it('overview lists every table with its group name', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    const ov = wb.getWorksheet('테이블 목록')!
    const rows: string[][] = []
    ov.eachRow((r) => rows.push((r.values as unknown[]).slice(1).map(String)))
    const flat = rows.map((r) => r.join('|')).join('\n')
    expect(flat).toContain('사용자관리|public.users')
    expect(flat).toContain('미분류|public.loose')
  })

  it('a group sheet stacks a bold title row + the standard column header per table', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    const ws = wb.getWorksheet('사용자관리')!
    const firstCol: string[] = []
    ws.eachRow((r) => firstCol.push(String(r.getCell(1).value ?? '')))
    expect(firstCol).toContain('public.users — app users') // title block
    expect(firstCol).toContain('컬럼명') // column header row
  })

  it('keeps the shared header fill color on a column header row', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    const ws = wb.getWorksheet('사용자관리')!
    // find a row whose first cell is the column header, assert its fill
    let filled = false
    ws.eachRow((r) => {
      if (String(r.getCell(1).value) === '컬럼명') {
        const fill = r.getCell(1).fill as ExcelJS.FillPattern
        if (fill?.fgColor?.argb === `FF${HEADER_FILL}`) filled = true
      }
    })
    expect(filled).toBe(true)
  })
})
```

- [ ] **Step 4: 실패 확인**

Run: `cd frontend && npx vitest run src/features/export-table-doc/lib/buildXlsx.test.ts`
Expected: FAIL — 현재 빌더는 테이블당 시트(시트명 'users'/'roles'/'loose')라 '테이블 목록'/'사용자관리'/'미분류' 시트가 없음.

- [ ] **Step 5: buildXlsx 그룹별 재작성**

`buildXlsx.ts`를 교체(헬퍼 `clampSheetName`/`uniqueSheetName`/`styleHeader`/`borderRow`/`thin`/`BORDER`는 유지). 테이블 블록 헬퍼를 추출하고 그룹/미분류/개요/Enums 시트를 구성:

```ts
import ExcelJS from 'exceljs'
import { columnRow, type TableDocModel, type TableDocTable } from '@/entities/table-doc'
import type { TableDocLabels } from './labels'
import { HEADER_FILL, HEADER_TEXT, GRID_BORDER, STANDARD_COLUMN_WIDTHS } from './tableDocStyle'

const MAX_SHEET_NAME = 31
const clampSheetName = (name: string): string => name.slice(0, MAX_SHEET_NAME)

function uniqueSheetName(name: string, used: Set<string>): string {
  let candidate = clampSheetName(name)
  let n = 2
  while (used.has(candidate)) {
    const suffix = `~${n}`
    candidate = clampSheetName(name).slice(0, MAX_SHEET_NAME - suffix.length) + suffix
    n++
  }
  used.add(candidate)
  return candidate
}

const thin = { style: 'thin' as const, color: { argb: `FF${GRID_BORDER}` } }
const BORDER = { top: thin, left: thin, bottom: thin, right: thin }

function styleHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_FILL}` } }
    cell.font = { bold: true, color: { argb: `FF${HEADER_TEXT}` } }
    cell.border = BORDER
  })
}

function borderRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.border = BORDER
  })
}

/** Write one table's definition block: bold title, standard column header,
 *  column rows, optional CHECK section, then a blank separator row. */
function writeTableBlock(ws: ExcelJS.Worksheet, table: TableDocTable, labels: TableDocLabels): void {
  const title = table.note
    ? `${table.schema}.${table.name} — ${table.note}`
    : `${table.schema}.${table.name}`
  const titleRow = ws.addRow([title])
  titleRow.getCell(1).font = { bold: true }

  styleHeader(ws.addRow([...labels.columnHeaders]))
  for (const col of table.columns) borderRow(ws.addRow(columnRow(col)))

  const checks = Array.isArray(table.checks) ? table.checks : []
  if (checks.length > 0) {
    ws.addRow([])
    const checkTitle = ws.addRow([labels.checks])
    checkTitle.getCell(1).font = { bold: true }
    styleHeader(ws.addRow([labels.checkName, labels.checkValues, labels.checkExpression]))
    for (const chk of checks) {
      borderRow(ws.addRow([chk.name, chk.values.join(', '), chk.expression]))
    }
  }
  ws.addRow([]) // separator between tables
}

/**
 * Build a styled .xlsx Blob organized BY TABLE GROUP: a leading "테이블 목록"
 * overview sheet, then one worksheet per group (member tables stacked as
 * definition blocks), an "미분류" sheet for ungrouped tables (if any), and a
 * trailing Enums sheet. Shared header style + column widths. No download, no React.
 */
export async function buildTableDocXlsxBlob(
  model: TableDocModel,
  labels: TableDocLabels,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  const used = new Set<string>([clampSheetName(labels.overviewSheet), labels.enumsSheet])

  const byId = new Map(model.tables.map((t) => [t.id, t]))
  const groups = model.groups
    .map((g) => ({
      name: g.name,
      tables: g.tableIds
        .map((id) => byId.get(id))
        .filter((t): t is TableDocTable => t !== undefined),
    }))
    .filter((g) => g.tables.length > 0)
  const groupedIds = new Set<string>()
  for (const g of groups) for (const t of g.tables) groupedIds.add(t.id)
  const ungrouped = model.tables.filter((t) => !groupedIds.has(t.id))

  // 1) Overview sheet — every table with its group name.
  const overview = wb.addWorksheet(clampSheetName(labels.overviewSheet))
  overview.columns = [{ width: 6 }, { width: 22 }, { width: 28 }, { width: 40 }]
  styleHeader(
    overview.addRow([labels.overviewNo, labels.overviewGroup, labels.overviewTable, labels.overviewDesc]),
  )
  let n = 1
  const addOverviewRow = (groupName: string, t: TableDocTable) =>
    borderRow(overview.addRow([n++, groupName, `${t.schema}.${t.name}`, t.note]))
  for (const g of groups) for (const t of g.tables) addOverviewRow(g.name, t)
  for (const t of ungrouped) addOverviewRow(labels.ungroupedSheet, t)

  // 2) One sheet per group.
  for (const g of groups) {
    const ws = wb.addWorksheet(uniqueSheetName(g.name, used))
    ws.columns = STANDARD_COLUMN_WIDTHS.map((w) => ({ width: w }))
    for (const t of g.tables) writeTableBlock(ws, t, labels)
  }

  // 3) Ungrouped sheet (only when there are ungrouped tables).
  if (ungrouped.length > 0) {
    const ws = wb.addWorksheet(uniqueSheetName(labels.ungroupedSheet, used))
    ws.columns = STANDARD_COLUMN_WIDTHS.map((w) => ({ width: w }))
    for (const t of ungrouped) writeTableBlock(ws, t, labels)
  }

  // 4) Trailing Enums sheet.
  const enumWs = wb.addWorksheet(clampSheetName(labels.enumsSheet))
  enumWs.columns = [{ width: 28 }, { width: 22 }, { width: 30 }]
  styleHeader(enumWs.addRow([labels.enumColEnum, labels.enumColValue, labels.enumColNote]))
  for (const en of model.enums) {
    for (const value of en.values) {
      borderRow(enumWs.addRow([`${en.schema}.${en.name}`, value.name, value.note]))
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
```

- [ ] **Step 6: 통과 확인**

Run: `cd frontend && npx vitest run src/features/export-table-doc/lib/buildXlsx.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: 타입 확인 (변경 파일 클린)**

Run: `cd frontend && npx tsc --noEmit --composite false --incremental false -p tsconfig.app.json 2>&1 | sed -E 's/\x1b\[[0-9;]*m//g' | grep -E "export-table-doc/lib/(buildXlsx|labels)" || echo "clean"`
Expected: 변경 파일에 신규 타입 에러 없음.

- [ ] **Step 8: 커밋**

```bash
git add frontend/src/features/export-table-doc/lib/buildXlsx.ts frontend/src/features/export-table-doc/lib/buildXlsx.test.ts frontend/src/features/export-table-doc/lib/labels.ts frontend/src/shared/i18n/locales/ko.json frontend/src/shared/i18n/locales/en.json
git commit -m "feat(export): organize Table Doc Excel by table group (overview + per-group sheets)"
```

---

## Task 3: SQL 방언에서 MS SQL 제거

**Files:**
- Modify: `frontend/src/entities/dbml/model/sqlTypes.ts`
- Modify: `frontend/src/entities/dbml/lib/sqlImport.test.ts`, `sqlExport.test.ts`
- Modify: `frontend/src/features/sql-export/lib/downloadSql.test.ts`
- Modify: `frontend/src/widgets/export-menu/ui/ExportMenu.test.tsx`

**Interfaces:**
- Produces: `SqlDialect = 'postgres' | 'mysql'`; `SQL_DIALECT_VALUES = ['postgres', 'mysql']`; `SQL_DIALECTS` has no `mssql` key. Consumers (ExportMenu SQL items, SqlImportDialog selector) iterate `SQL_DIALECT_VALUES` and shrink automatically.

- [ ] **Step 1: 실패 테스트 작성 (mssql 부재)**

`sqlTypes`에 대한 단위 테스트가 없으면 `frontend/src/entities/dbml/model/sqlTypes.test.ts`를 신규 생성:

```ts
import { describe, it, expect } from 'vitest'
import { SQL_DIALECTS, SQL_DIALECT_VALUES } from './sqlTypes'

describe('SQL dialects', () => {
  it('supports only postgres and mysql (no mssql)', () => {
    expect(SQL_DIALECT_VALUES).toEqual(['postgres', 'mysql'])
    expect(Object.keys(SQL_DIALECTS).sort()).toEqual(['mysql', 'postgres'])
    expect('mssql' in SQL_DIALECTS).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/entities/dbml/model/sqlTypes.test.ts`
Expected: FAIL — 현재 `SQL_DIALECT_VALUES`에 `'mssql'` 포함.

- [ ] **Step 3: sqlTypes에서 mssql 제거**

`sqlTypes.ts`:

```ts
export type SqlDialect = 'postgres' | 'mysql'

export interface SqlDialectDescriptor {
  label: string
  importFormat: 'postgres' | 'mysql'
  exportFormat: 'postgres' | 'mysql'
}

export const SQL_DIALECTS: Record<SqlDialect, SqlDialectDescriptor> = {
  postgres: { label: 'PostgreSQL', importFormat: 'postgres', exportFormat: 'postgres' },
  mysql: { label: 'MySQL', importFormat: 'mysql', exportFormat: 'mysql' },
}

export const SQL_DIALECT_VALUES: SqlDialect[] = ['postgres', 'mysql']
```
(주석의 "three dialects" 문구도 "two dialects (postgres, mysql)"로 갱신.)

- [ ] **Step 4: mssql 참조 테스트 갱신**

- `sqlImport.test.ts`: `it('imports an MS SQL CREATE TABLE to DBML', …)` 블록 전체 삭제.
- `sqlExport.test.ts`: `it('exports DBML to MS SQL containing CREATE TABLE', …)` 블록 전체 삭제.
- `downloadSql.test.ts`: `it('uses the dialect in the filename for mysql and mssql', …)`에서 mssql 부분 삭제하고 이름을 `'uses the dialect in the filename for mysql'`로 변경, mssql 호출/단언 2줄 제거:
  ```ts
  it('uses the dialect in the filename for mysql', () => {
    vi.spyOn(dbml, 'exportDbmlToSql').mockReturnValue({ ok: true, sql: 'X;' })
    const dl = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {})
    downloadSql('Table t { id int }', 'mysql')
    expect(dl.mock.calls[0][1]).toBe('schema.mysql.sql')
  })
  ```
- `ExportMenu.test.tsx`: "renders the unified sections" 기대 목록에서 `'SQL · MS SQL Server'` 항목 제거.

- [ ] **Step 5: 통과 확인**

Run: `cd frontend && npx vitest run src/entities/dbml/model/sqlTypes.test.ts src/entities/dbml/lib/sqlImport.test.ts src/entities/dbml/lib/sqlExport.test.ts src/features/sql-export/lib/downloadSql.test.ts src/widgets/export-menu/ui/ExportMenu.test.tsx`
Expected: PASS (mssql 케이스 제거, 신규 가드 통과).

- [ ] **Step 6: 타입 확인 (mssql 잔존 참조 없음)**

Run: `cd frontend && grep -rni "mssql" src || echo "no mssql refs remain"`
Expected: `no mssql refs remain` (또는 무관한 주석만).

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/entities/dbml/model/sqlTypes.ts frontend/src/entities/dbml/model/sqlTypes.test.ts frontend/src/entities/dbml/lib/sqlImport.test.ts frontend/src/entities/dbml/lib/sqlExport.test.ts frontend/src/features/sql-export/lib/downloadSql.test.ts frontend/src/widgets/export-menu/ui/ExportMenu.test.tsx
git commit -m "feat(sql): drop MS SQL Server dialect (Postgres + MySQL only)"
```

---

## Task 4: E2E — 그룹별 Excel 다운로드 + SQL 메뉴 확인 (도커 스택 필요)

**Files:**
- Modify: `frontend/e2e/export.spec.ts`

**Interfaces:**
- Consumes: 전체 배선(Task 1–3). 도커 스택 + Playwright(webServer 자동 기동).

- [ ] **Step 1: SQL 메뉴 확인 추가 + Excel 비어있지않음 유지**

기존 `export.spec.ts`의 Table Doc Excel 테스트(이미 `table-definition.xlsx` 비어있지않음 검증)는 그대로 두면 그룹별 구조에서도 통과한다(파일은 여전히 비어있지 않음). SQL 방언 축소를 확인하는 테스트를 추가:

```ts
test('SQL export menu offers only PostgreSQL and MySQL (no MS SQL)', async ({ page }) => {
  await registerAndLogin(page, `export-sql-${Date.now()}@example.com`)
  await openEditorWithProject(page)
  await page.getByRole('button', { name: '내보내기', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'SQL · PostgreSQL' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'SQL · MySQL' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /MS SQL/ })).toHaveCount(0)
})
```

- [ ] **Step 2: E2E 실행 (도커 스택 가동, 호스트에서)**

Run: `cd frontend && VITE_PROXY_TARGET=http://localhost:4000 npx playwright test export --project=chromium --reporter=line`
Expected: 모든 export 테스트 PASS — Excel(그룹별)·PDF·Word·다이어그램·미리보기 다운로드 + 새 SQL 메뉴 확인. Excel은 그룹별 구조여도 `table-definition.xlsx` 비어있지않음이 유지된다. 도커 스택이 없으면 미실행으로 보고(G3) — 단위 테스트(Task 2–3)가 핵심 로직을 커버함을 명시.

- [ ] **Step 3: 커밋**

```bash
git add frontend/e2e/export.spec.ts
git commit -m "test(e2e): grouped Excel still downloads; SQL menu has no MS SQL"
```

---

## Self-Review

**Spec coverage:**
- §3 모델 확장(`groups`) → Task 1. ✓
- §4 Excel 구조(개요+그룹시트+미분류+Enums, 블록 레이아웃) → Task 2. ✓
- §5 파일(types/deriveTableDoc/buildXlsx/labels/i18n) → Task 1–2; MS SQL(sqlTypes+테스트) → Task 3. ✓
- §6 검증(deriveTableDoc 그룹·buildXlsx 되읽기·mssql 부재·E2E) → Task 1/2/3/4. ✓
- §7 범위 밖(표지/매크로/샘플 컬럼셋/그룹별 docx·pdf) → 계획에 없음. ✓

**Placeholder scan:** TBD/TODO 없음. 모든 코드 스텝에 실제 코드. Task 4의 "도커 없으면 미실행 보고"는 환경 의존 사실.

**Type consistency:**
- `TableDocModel.groups: { name: string; tableIds: string[] }[]` — Task 1 정의 ↔ Task 2 buildXlsx 소비(`model.groups`, `g.tableIds`). ✓
- `TableDocLabels`의 신규 필드(`overviewSheet/overviewNo/overviewGroup/overviewTable/overviewDesc/ungroupedSheet`) — Task 2 labels 정의 ↔ buildXlsx 소비 ↔ buildXlsx.test의 LABELS. ✓
- `buildTableDocXlsxBlob(model, labels): Promise<Blob>` 시그니처 불변(내부 구조만 변경) → 워커/래퍼 호출부 영향 없음. ✓
- `SqlDialect = 'postgres' | 'mysql'`; `SQL_DIALECT_VALUES`/`SQL_DIALECTS` 키 정합 — Task 3. ✓
- i18n 키(`tableDoc.overviewSheet/colNo/colGroup/colTable/ungrouped`) ko/en 양쪽 — Task 2. ✓
