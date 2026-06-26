# 테이블 정의서 DOCX + XLSX 스타일 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 테이블 정의서 내보내기에 스타일된 DOCX(.docx)를 추가하고, XLSX를 exceljs로 교체해 헤더 색·컬럼 너비·테두리를 입힌다.

**Architecture:** 기존 단일 모델(`TableDocModel`) + 단일 컬럼 출처(`STANDARD_COLUMNS`/`columnRow`) + 번역 라벨(`tableDocLabels`)을 그대로 소비하는 새 빌더(`buildDocx`)와 exceljs 기반 `buildXlsx`를 만든다. 둘 다 기존 Web Worker 디스패처(`tableDoc.worker.ts`) + 메인스레드 폴백(`buildTableDocBlob`) + 진행 오버레이 경로에 올라탄다. 스타일 상수는 `tableDocStyle.ts` 한 곳에서 공유한다.

**Tech Stack:** React + Vite + TypeScript, `docx`(dolanmiu), `exceljs`(SheetJS `xlsx` 대체), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-26-table-doc-docx-and-xlsx-styling-design.md`

## Global Constraints

- 단일 출처(G1/F1): 모든 export는 `TableDocModel` + `STANDARD_COLUMNS` + `columnRow`/`fkLocalCell`/`fkTargetCell` + `tableDocLabels(t)`에서 나온다. 새 빌더도 이것만 소비(컬럼/라벨 재정의 금지).
- 헤더 스타일: 배경 `#3E6AE1`, 글자 흰색, 굵게. 테두리 `#D1D5DB`. (hex는 `#` 없이 저장; exceljs는 `FF` 알파 prefix(ARGB), docx는 6자리 그대로.)
- 컬럼 너비는 `STANDARD_COLUMN_WIDTHS` 한 곳에서 정의(STANDARD_COLUMNS 순서, 길이 일치).
- i18n(F4): 사용자 노출 문자열은 ko/en 양쪽에 키 추가 후 `t()`로만.
- 레이아웃은 PDF(`buildPdf.ts`)와 동일: 테이블마다 `schema.name`(+note) 제목 → 컬럼 표 → (있으면) FK 표 → (있으면) CHECK 표, 마지막에 Enum 표.
- `buildTableDocXlsxBlob`은 exceljs 전환으로 **async**가 된다(`writeBuffer`).
- 검증: `cd frontend && npx vitest run <files>`; 타입 `npx tsc --noEmit --composite false --incremental false -p tsconfig.app.json`(루트 `npm run type-check`는 사전부터 no-op); E2E `VITE_PROXY_TARGET=http://localhost:4000 npx playwright test export --project=chromium --reporter=line`.
- 워커 실패 시 `buildTableDocBlob`가 메인스레드 폴백 → 다운로드 자체 실패로는 안 이어짐.

---

## File Structure

- **Create** `frontend/src/features/export-table-doc/lib/tableDocStyle.ts` — 공통 색/너비 상수 + docx 비율 변환 helper.
- **Create** `frontend/src/features/export-table-doc/lib/tableDocStyle.test.ts`
- **Create** `frontend/src/features/export-table-doc/lib/buildDocx.ts` — `buildTableDocDocxBlob`.
- **Create** `frontend/src/features/export-table-doc/lib/buildDocx.test.ts`
- **Modify** `frontend/src/features/export-table-doc/lib/buildXlsx.ts` — exceljs 재작성(async).
- **Modify** `frontend/src/features/export-table-doc/lib/buildXlsx.test.ts` — 실제 버퍼 되읽기.
- **Modify** `frontend/src/features/export-table-doc/lib/tableDoc.worker.ts` — `'docx'` kind + xlsx await.
- **Modify** `frontend/src/features/export-table-doc/lib/exportTableDoc.ts` — kind union + 폴백 + await.
- **Modify** `frontend/src/features/export-table-doc/index.ts` — `buildTableDocDocxBlob` export.
- **Modify** `frontend/src/widgets/export-menu/ui/ExportMenu.tsx` — Word 메뉴 항목.
- **Modify** `frontend/src/widgets/table-doc-view/ui/TableDocView.tsx` — `onDownloadDocx` prop + 버튼.
- **Modify** `frontend/src/widgets/table-doc-view/ui/TableDocViewHost.tsx` — Word 다운로드 배선.
- **Modify** `frontend/src/shared/i18n/locales/{ko,en}.json` — `exportMenu.tableDocWord`, `tableDoc.downloadWord`.
- **Modify** `frontend/package.json` — `+docx +exceljs -xlsx`.
- **Modify** `frontend/e2e/export.spec.ts` — Word 다운로드 검증.

---

## Task 1: 공통 스타일 상수 (`tableDocStyle.ts`)

**Files:**
- Create: `frontend/src/features/export-table-doc/lib/tableDocStyle.ts`
- Test: `frontend/src/features/export-table-doc/lib/tableDocStyle.test.ts`

**Interfaces:**
- Produces: `HEADER_FILL='3E6AE1'`, `HEADER_TEXT='FFFFFF'`, `GRID_BORDER='D1D5DB'` (모두 `#` 없는 hex); `STANDARD_COLUMN_WIDTHS: number[]` (STANDARD_COLUMNS 순서); `docxColumnPercents(weights: readonly number[]): number[]` (합 100 정규화, 정수).

- [ ] **Step 1: 실패 테스트 작성**

```ts
// tableDocStyle.test.ts
import { describe, it, expect } from 'vitest'
import { STANDARD_COLUMNS } from '@/entities/table-doc'
import {
  HEADER_FILL,
  STANDARD_COLUMN_WIDTHS,
  docxColumnPercents,
} from './tableDocStyle'

describe('tableDocStyle', () => {
  it('header fill is a 6-digit hex without #', () => {
    expect(HEADER_FILL).toMatch(/^[0-9A-Fa-f]{6}$/)
  })

  it('column widths align 1:1 with STANDARD_COLUMNS', () => {
    expect(STANDARD_COLUMN_WIDTHS).toHaveLength(STANDARD_COLUMNS.length)
    expect(STANDARD_COLUMN_WIDTHS.every((w) => w > 0)).toBe(true)
  })

  it('docxColumnPercents normalizes weights to integers summing to 100', () => {
    const pct = docxColumnPercents([1, 1, 2])
    expect(pct.reduce((a, b) => a + b, 0)).toBe(100)
    expect(pct.every((n) => Number.isInteger(n))).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/features/export-table-doc/lib/tableDocStyle.test.ts`
Expected: FAIL — `Cannot find module './tableDocStyle'`.

- [ ] **Step 3: 구현**

```ts
// tableDocStyle.ts
import { STANDARD_COLUMNS } from '@/entities/table-doc'

/**
 * Shared visual style for table-doc exports (xlsx + docx), so both formats look
 * identical (single source). Hex values omit '#'. exceljs wants an ARGB string
 * ('FF' alpha prefix); docx wants the raw 6-digit hex.
 */
export const HEADER_FILL = '3E6AE1'
export const HEADER_TEXT = 'FFFFFF'
export const GRID_BORDER = 'D1D5DB'

/**
 * Per-column width in STANDARD_COLUMNS order. Character-width units for xlsx;
 * converted to a percentage of table width for docx. Flags (PK/FK/NN/UNIQUE)
 * are narrow; name/type/default/note are wide.
 */
export const STANDARD_COLUMN_WIDTHS: readonly number[] = STANDARD_COLUMNS.map(
  (c) =>
    ({
      'tableDoc.colName': 22,
      'tableDoc.colType': 18,
      'tableDoc.colPk': 6,
      'tableDoc.colFk': 6,
      'tableDoc.colNn': 6,
      'tableDoc.colUnique': 8,
      'tableDoc.colDefault': 18,
      'tableDoc.colNote': 30,
    })[c.header] ?? 14,
)

/** Convert width weights to integer percentages summing to exactly 100. */
export function docxColumnPercents(weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0) || 1
  const raw = weights.map((w) => (w / total) * 100)
  const floored = raw.map((n) => Math.floor(n))
  let remainder = 100 - floored.reduce((a, b) => a + b, 0)
  // Distribute the rounding remainder to the largest fractional parts.
  const order = raw
    .map((n, i) => ({ i, frac: n - Math.floor(n) }))
    .sort((a, b) => b.frac - a.frac)
  for (const { i } of order) {
    if (remainder <= 0) break
    floored[i] += 1
    remainder--
  }
  return floored
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && npx vitest run src/features/export-table-doc/lib/tableDocStyle.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/export-table-doc/lib/tableDocStyle.ts frontend/src/features/export-table-doc/lib/tableDocStyle.test.ts
git commit -m "feat(export): shared table-doc export style constants"
```

---

## Task 2: XLSX를 exceljs로 교체 (스타일 + 너비)

**Files:**
- Modify: `frontend/src/features/export-table-doc/lib/buildXlsx.ts` (전면 재작성)
- Modify: `frontend/src/features/export-table-doc/lib/buildXlsx.test.ts` (mock 제거 → 실제 버퍼 되읽기)
- Modify: `frontend/package.json` (`+exceljs -xlsx`)

**Interfaces:**
- Consumes: `tableDocStyle` (Task 1), `columnRow`/`TableDocModel`/`TableDocLabels`.
- Produces: `buildTableDocXlsxBlob(model: TableDocModel, labels: TableDocLabels): Promise<Blob>` (**async**).

- [ ] **Step 1: 의존성 교체**

```bash
cd frontend && npm install exceljs && npm uninstall xlsx
```
(확인: `node -e "require('exceljs'); console.log('exceljs ok')"`. `xlsx`는 `buildXlsx.ts`에서만 쓰였으므로 제거 안전 — `grep -rn \"from 'xlsx'\" src` 가 빈 결과여야 함.)

- [ ] **Step 2: 실패 테스트 작성 (실제 버퍼 되읽기)**

`buildXlsx.test.ts`를 아래로 교체. exceljs로 결과 버퍼를 되읽어 시트명·헤더값·헤더 채우기색·컬럼 너비·셀 값을 검증한다.

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
}

const model: TableDocModel = {
  tables: [
    {
      id: 'public.users', schema: 'public', name: 'users', note: 'app users',
      columns: [
        { name: 'id', type: 'integer', pk: true, fk: false, notNull: true, unique: false, default: '', note: 'pk' },
        { name: 'email', type: 'varchar', pk: false, fk: false, notNull: true, unique: true, default: '', note: '' },
      ],
      fkTargets: [], checks: [],
    },
  ],
  enums: [{ id: 'public.role', schema: 'public', name: 'role', note: '', values: [{ name: 'admin', note: '' }] }],
}

async function read(blob: Blob): Promise<ExcelJS.Workbook> {
  const buf = await blob.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  return wb
}

describe('buildTableDocXlsxBlob (exceljs)', () => {
  it('creates one worksheet per table plus an Enums sheet', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    expect(wb.getWorksheet('users')).toBeTruthy()
    expect(wb.getWorksheet('Enums')).toBeTruthy()
  })

  it('writes the translated header row and a data row', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    const ws = wb.getWorksheet('users')!
    expect(ws.getRow(1).values).toEqual(expect.arrayContaining(['컬럼명', '데이터타입', '설명']))
    expect(ws.getRow(2).getCell(1).value).toBe('id')
  })

  it('styles the header row with the shared fill color', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    const cell = wb.getWorksheet('users')!.getRow(1).getCell(1)
    expect((cell.fill as ExcelJS.FillPattern).fgColor?.argb).toBe(`FF${HEADER_FILL}`)
    expect(cell.font?.bold).toBe(true)
  })

  it('sets a column width on the first column', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    expect(wb.getWorksheet('users')!.getColumn(1).width).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `cd frontend && npx vitest run src/features/export-table-doc/lib/buildXlsx.test.ts`
Expected: FAIL — 기존 `buildTableDocXlsxBlob`이 sync(SheetJS)라 헤더 색/너비 단언 실패(또는 await 타입 불일치).

- [ ] **Step 4: 구현 (exceljs 재작성)**

`buildXlsx.ts`를 아래로 교체. 시트명 클램프/중복 회피 helper는 유지하고, 헤더 스타일·너비·테두리·CHECK 섹션을 exceljs로 작성.

```ts
import ExcelJS from 'exceljs'
import { columnRow, type TableDocModel } from '@/entities/table-doc'
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

/** Style the first row of a worksheet as a header (fill + bold white + border). */
function styleHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_FILL}` } }
    cell.font = { bold: true, color: { argb: `FF${HEADER_TEXT}` } }
    cell.border = BORDER
  })
}

/** Apply grid borders to every cell of a data row. */
function borderRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.border = BORDER
  })
}

/**
 * Build a styled .xlsx Blob from the derived table-doc model: one worksheet per
 * table (header row + standard columns + an optional CHECK section), plus a
 * trailing Enums sheet. Header rows carry the shared fill/bold style; standard
 * columns get widths from STANDARD_COLUMN_WIDTHS. Async because exceljs writes
 * the buffer asynchronously. No download, no React.
 */
export async function buildTableDocXlsxBlob(
  model: TableDocModel,
  labels: TableDocLabels,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  const used = new Set<string>([labels.enumsSheet])

  for (const table of model.tables) {
    const ws = wb.addWorksheet(uniqueSheetName(table.name, used))
    ws.columns = STANDARD_COLUMN_WIDTHS.map((w) => ({ width: w }))

    const header = ws.addRow([...labels.columnHeaders])
    styleHeader(header)
    for (const col of table.columns) borderRow(ws.addRow(columnRow(col)))

    const checks = Array.isArray(table.checks) ? table.checks : []
    if (checks.length > 0) {
      ws.addRow([])
      const checkHeader = ws.addRow([labels.checkName, labels.checkValues, labels.checkExpression])
      styleHeader(checkHeader)
      for (const chk of checks) {
        borderRow(ws.addRow([chk.name, chk.values.join(', '), chk.expression]))
      }
    }
  }

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

- [ ] **Step 5: 통과 확인**

Run: `cd frontend && npx vitest run src/features/export-table-doc/lib/buildXlsx.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/export-table-doc/lib/buildXlsx.ts frontend/src/features/export-table-doc/lib/buildXlsx.test.ts frontend/package.json frontend/package-lock.json
git commit -m "feat(export): style Table Doc Excel via exceljs (header color, widths, borders)"
```

---

## Task 3: DOCX 빌더 (`buildDocx.ts`)

**Files:**
- Create: `frontend/src/features/export-table-doc/lib/buildDocx.ts`
- Test: `frontend/src/features/export-table-doc/lib/buildDocx.test.ts`
- Modify: `frontend/package.json` (`+docx`)

**Interfaces:**
- Consumes: `tableDocStyle` (Task 1), `columnRow`/`fkLocalCell`/`fkTargetCell`/`TableDocModel`/`TableDocLabels`.
- Produces: `buildTableDocDocxBlob(model: TableDocModel, labels: TableDocLabels): Promise<Blob>`.

- [ ] **Step 1: 의존성 추가**

```bash
cd frontend && npm install docx
```
(확인: `node -e "require('docx'); console.log('docx ok')"`.)

- [ ] **Step 2: 실패 테스트 작성 (구조 스모크 — 비throw·비어있지 않음)**

docx 출력은 zip(deflate)이라 본문 grep이 불가하므로, 대표 모델에서 (a) 비어있지 않은 Blob, (b) throw 없음을 검증한다. 내용 충실도는 동일 모델/라벨/컬럼 소스를 xlsx와 공유하므로 xlsx 테스트가 커버하고, 최종 E2E가 실파일을 연다.

```ts
import { describe, it, expect } from 'vitest'
import type { TableDocModel } from '@/entities/table-doc'
import { buildTableDocDocxBlob } from './buildDocx'
import type { TableDocLabels } from './labels'

const LABELS: TableDocLabels = {
  columnHeaders: ['컬럼명', '데이터타입', 'PK', 'FK', 'NN', 'UNIQUE', '기본값', '설명'],
  fkColumn: '컬럼', fkReference: '참조',
  enumColEnum: 'Enum', enumColValue: '값', enumColNote: '설명', enumsSheet: 'Enums',
  checks: 'CHECK 제약', checkName: '이름', checkValues: '허용값', checkExpression: '표현식',
}

const full: TableDocModel = {
  tables: [
    {
      id: 'public.users', schema: 'public', name: 'users', note: 'app users',
      columns: [{ name: 'id', type: 'int', pk: true, fk: false, notNull: true, unique: false, default: '', note: 'pk' }],
      fkTargets: [{ columns: ['org_id'], targetSchema: 'public', targetTable: 'orgs', targetColumns: ['id'] }],
      checks: [{ name: 'c', values: ['a', 'b'], expression: "kind IN ('a','b')" }],
    },
  ],
  enums: [{ id: 'public.role', schema: 'public', name: 'role', note: '', values: [{ name: 'admin', note: '' }] }],
}

const empty: TableDocModel = { tables: [], enums: [] }

describe('buildTableDocDocxBlob', () => {
  it('produces a non-empty .docx Blob for a full model (tables, fk, checks, enums)', async () => {
    const blob = await buildTableDocDocxBlob(full, LABELS)
    expect(blob.size).toBeGreaterThan(0)
    expect(blob.type).toContain('word')
  })

  it('does not throw on an empty model', async () => {
    const blob = await buildTableDocDocxBlob(empty, LABELS)
    expect(blob.size).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `cd frontend && npx vitest run src/features/export-table-doc/lib/buildDocx.test.ts`
Expected: FAIL — `Cannot find module './buildDocx'`.

- [ ] **Step 4: 구현**

```ts
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  WidthType, ShadingType, HeadingLevel, AlignmentType,
} from 'docx'
import {
  columnRow, fkLocalCell, fkTargetCell,
  type TableDocModel, type TableDocTable,
} from '@/entities/table-doc'
import type { TableDocLabels } from './labels'
import { HEADER_FILL, HEADER_TEXT, STANDARD_COLUMN_WIDTHS, docxColumnPercents } from './tableDocStyle'

const STD_PCT = docxColumnPercents(STANDARD_COLUMN_WIDTHS)

function headerCell(text: string, widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.SOLID, color: HEADER_FILL, fill: HEADER_FILL },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: HEADER_TEXT })] })],
  })
}

function bodyCell(text: string, widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    children: [new Paragraph(text)],
  })
}

/** A styled docx table: a header row + body rows, columns sized by `pcts`. */
function styledTable(headers: string[], rows: string[][], pcts: number[]): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => headerCell(h, pcts[i] ?? Math.floor(100 / headers.length))),
  })
  const bodyRows = rows.map(
    (r) =>
      new TableRow({
        children: r.map((c, i) => bodyCell(c, pcts[i] ?? Math.floor(100 / headers.length))),
      }),
  )
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  })
}

function evenPcts(n: number): number[] {
  return docxColumnPercents(Array.from({ length: n }, () => 1))
}

/** All docx blocks for one table: title + columns table + optional fk/checks. */
function tableBlocks(table: TableDocTable, labels: TableDocLabels): (Paragraph | Table)[] {
  const title = table.note ? `${table.schema}.${table.name} — ${table.note}` : `${table.schema}.${table.name}`
  const blocks: (Paragraph | Table)[] = [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_2 }),
    styledTable([...labels.columnHeaders], table.columns.map(columnRow), STD_PCT),
  ]
  if (table.fkTargets.length > 0) {
    blocks.push(new Paragraph(''))
    blocks.push(
      styledTable(
        [labels.fkColumn, labels.fkReference],
        table.fkTargets.map((fk) => [fkLocalCell(fk), fkTargetCell(fk)]),
        evenPcts(2),
      ),
    )
  }
  const checks = Array.isArray(table.checks) ? table.checks : []
  if (checks.length > 0) {
    blocks.push(new Paragraph(''))
    blocks.push(
      styledTable(
        [labels.checkName, labels.checkValues, labels.checkExpression],
        checks.map((chk) => [chk.name, chk.values.join(', '), chk.expression]),
        evenPcts(3),
      ),
    )
  }
  blocks.push(new Paragraph(''))
  return blocks
}

/**
 * Build a styled .docx Blob from the derived table-doc model — same layout as
 * the PDF: per table a heading + a styled column table (+ optional FK/CHECK
 * tables), then a trailing Enum table. Reuses the shared header style and
 * column widths. Korean needs no embedded font (Word resolves it). No download.
 */
export async function buildTableDocDocxBlob(
  model: TableDocModel,
  labels: TableDocLabels,
): Promise<Blob> {
  const children: (Paragraph | Table)[] = []
  for (const table of model.tables) children.push(...tableBlocks(table, labels))

  const enumRows = model.enums.flatMap((en) =>
    en.values.map((v) => [`${en.schema}.${en.name}`, v.name, v.note]),
  )
  children.push(new Paragraph({ text: labels.enumsSheet, heading: HeadingLevel.HEADING_2 }))
  children.push(
    styledTable(
      [labels.enumColEnum, labels.enumColValue, labels.enumColNote],
      enumRows,
      evenPcts(3),
    ),
  )

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBlob(doc)
}
```

(참고: `AlignmentType` import는 사용 안 하면 제거 — 린트 통과 위해 실제 사용분만 남길 것.)

- [ ] **Step 5: 통과 확인**

Run: `cd frontend && npx vitest run src/features/export-table-doc/lib/buildDocx.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/export-table-doc/lib/buildDocx.ts frontend/src/features/export-table-doc/lib/buildDocx.test.ts frontend/package.json frontend/package-lock.json
git commit -m "feat(export): styled Table Doc DOCX builder (docx)"
```

---

## Task 4: 워커 디스패처 + 래퍼 + index에 docx 연결

**Files:**
- Modify: `frontend/src/features/export-table-doc/lib/tableDoc.worker.ts`
- Modify: `frontend/src/features/export-table-doc/lib/exportTableDoc.ts`
- Modify: `frontend/src/features/export-table-doc/index.ts`

**Interfaces:**
- Consumes: `buildTableDocDocxBlob` (Task 3), `buildTableDocXlsxBlob`(async, Task 2), `buildTableDocPdfBlob`.
- Produces: `TableDocExportKind = 'xlsx' | 'pdf' | 'docx'`; `buildTableDocBlob(kind, model, labels)` supports `'docx'`.

- [ ] **Step 1: 워커 디스패처 갱신**

`tableDoc.worker.ts`: `Job.kind`에 `'docx'` 추가, xlsx도 await, docx 분기 추가.

```ts
/// <reference lib="webworker" />
import { buildTableDocXlsxBlob } from './buildXlsx'
import { buildTableDocPdfBlob } from './buildPdf'
import { buildTableDocDocxBlob } from './buildDocx'
import type { TableDocModel } from '@/entities/table-doc'
import type { TableDocLabels } from './labels'

interface Job {
  kind: 'xlsx' | 'pdf' | 'docx'
  model: TableDocModel
  labels: TableDocLabels
}

self.onmessage = async (e: MessageEvent<Job>) => {
  const { kind, model, labels } = e.data
  try {
    const blob =
      kind === 'pdf'
        ? await buildTableDocPdfBlob(model, labels)
        : kind === 'docx'
          ? await buildTableDocDocxBlob(model, labels)
          : await buildTableDocXlsxBlob(model, labels)
    self.postMessage({ type: 'done', result: blob })
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
```

- [ ] **Step 2: 래퍼 갱신**

`exportTableDoc.ts`: kind union 확장, await xlsx, docx 폴백.

```ts
import { runWorkerJob } from '@/shared/lib/runWorkerJob'
import type { TableDocModel } from '@/entities/table-doc'
import { buildTableDocXlsxBlob } from './buildXlsx'
import { buildTableDocPdfBlob } from './buildPdf'
import { buildTableDocDocxBlob } from './buildDocx'
import type { TableDocLabels } from './labels'

export type TableDocExportKind = 'xlsx' | 'pdf' | 'docx'

function spawnWorker(): Worker {
  return new Worker(new URL('./tableDoc.worker.ts', import.meta.url), { type: 'module' })
}

function buildOnMainThread(
  kind: TableDocExportKind, model: TableDocModel, labels: TableDocLabels,
): Promise<Blob> {
  if (kind === 'pdf') return buildTableDocPdfBlob(model, labels)
  if (kind === 'docx') return buildTableDocDocxBlob(model, labels)
  return buildTableDocXlsxBlob(model, labels)
}

/**
 * Build the table-doc file (xlsx/pdf/docx) in a Web Worker so a large export
 * never freezes the UI. Falls back to main-thread generation if the worker
 * can't run the job. Returns the file Blob; the caller triggers the download.
 */
export async function buildTableDocBlob(
  kind: TableDocExportKind,
  model: TableDocModel,
  labels: TableDocLabels,
): Promise<Blob> {
  try {
    return await runWorkerJob<Blob>(spawnWorker(), { kind, model, labels })
  } catch {
    return buildOnMainThread(kind, model, labels)
  }
}
```

- [ ] **Step 3: index export 추가**

`index.ts`에 추가:

```ts
export { buildTableDocDocxBlob } from './lib/buildDocx'
```

- [ ] **Step 4: 타입 + 단위 회귀 확인**

Run: `cd frontend && npx tsc --noEmit --composite false --incremental false -p tsconfig.app.json 2>&1 | sed -E 's/\x1b\[[0-9;]*m//g' | grep -E "export-table-doc/lib/(tableDoc.worker|exportTableDoc)" || echo "touched files clean"`
Expected: 변경 파일에 신규 타입에러 없음.
Run: `cd frontend && npx vitest run src/features/export-table-doc`
Expected: PASS (Task 1–3 테스트 전부).

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/export-table-doc/lib/tableDoc.worker.ts frontend/src/features/export-table-doc/lib/exportTableDoc.ts frontend/src/features/export-table-doc/index.ts
git commit -m "feat(export): route docx through the table-doc export worker + fallback"
```

---

## Task 5: UI 배선 (Export 메뉴 + 미리보기 + i18n)

**Files:**
- Modify: `frontend/src/shared/i18n/locales/ko.json`, `frontend/src/shared/i18n/locales/en.json`
- Modify: `frontend/src/widgets/export-menu/ui/ExportMenu.tsx`
- Modify: `frontend/src/widgets/table-doc-view/ui/TableDocView.tsx`
- Modify: `frontend/src/widgets/table-doc-view/ui/TableDocViewHost.tsx`

**Interfaces:**
- Consumes: `buildTableDocBlob('docx', …)` (Task 4).

- [ ] **Step 1: i18n 키 추가 (ko + en 양쪽)**

`ko.json` `exportMenu`에 `"tableDocWord": "테이블 정의서 Word"`, `tableDoc`에 `"downloadWord": "Word 다운로드"`.
`en.json` `exportMenu`에 `"tableDocWord": "Table Doc Word"`, `tableDoc`에 `"downloadWord": "Download Word"`.

- [ ] **Step 2: ExportMenu에 Word 항목 추가**

`ExportMenu.tsx`의 `exportPdf` 아래에 `exportWord` 추가:

```ts
  function exportWord() {
    if (!schema) return
    const model = deriveTableDoc(schema)
    const labels = tableDocLabels(t)
    void withProgress(async () =>
      downloadBlob(await buildTableDocBlob('docx', model, labels), 'table-definition.docx'),
    )
  }
```

그리고 Table Doc 섹션의 PDF 항목 아래에 메뉴 항목 추가:

```tsx
          <DropdownMenuItem onSelect={() => exportWord()}>{t('exportMenu.tableDocWord')}</DropdownMenuItem>
```

- [ ] **Step 3: TableDocView에 Word 다운로드 버튼 추가**

`TableDocView.tsx`: props에 `onDownloadDocx?: () => void` 추가(`onDownloadPdf` 옆), 구조분해에 추가, PDF 버튼 옆에 버튼 추가:

```tsx
  /** Download the current model as a Word 테이블 정의서. */
  onDownloadDocx?: () => void
```
```tsx
          {onDownloadDocx ? (
            <Button
              variant="outline"
              data-testid="table-doc-download-word"
              onClick={onDownloadDocx}
            >
              {t('tableDoc.downloadWord')}
            </Button>
          ) : null}
```

- [ ] **Step 4: TableDocViewHost 배선**

`TableDocViewHost.tsx`의 `TableDocView`에 `onDownloadDocx` 전달:

```tsx
        onDownloadDocx={
          model ? () => void download('docx', 'table-definition.docx') : undefined
        }
```
(`download` 헬퍼는 이미 `TableDocExportKind` 받음 — 'docx' 그대로 동작.)

- [ ] **Step 5: 타입 + JSON 유효성 확인**

Run: `cd frontend && node -e "require('./src/shared/i18n/locales/ko.json'); require('./src/shared/i18n/locales/en.json'); console.log('json ok')"`
Run: `cd frontend && npx tsc --noEmit --composite false --incremental false -p tsconfig.app.json 2>&1 | sed -E 's/\x1b\[[0-9;]*m//g' | grep -E "export-menu/ui/ExportMenu|table-doc-view/ui/(TableDocView|TableDocViewHost)" || echo "touched UI files clean"`
Expected: 변경 UI 파일에 신규 타입에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/widgets/export-menu/ui/ExportMenu.tsx frontend/src/widgets/table-doc-view/ui/TableDocView.tsx frontend/src/widgets/table-doc-view/ui/TableDocViewHost.tsx frontend/src/shared/i18n/locales/ko.json frontend/src/shared/i18n/locales/en.json
git commit -m "feat(export): add Word (.docx) Table Doc export to the menu and preview"
```

---

## Task 6: E2E — Word/Excel 다운로드 검증 (도커 스택 필요)

**Files:**
- Modify: `frontend/e2e/export.spec.ts`

**Interfaces:**
- Consumes: 전체 배선(Task 1–5). 도커 스택 가동 + Playwright(webServer 자동 기동).

- [ ] **Step 1: Word 다운로드 테스트 추가 + Excel 비어있지않음 강화**

`export.spec.ts`의 Table Doc 테스트에 Word를 추가한다(기존 `downloadFromMenu`/`streamSize` 헬퍼 재사용). Excel/PDF 테스트는 그대로 두고, Word용 케이스를 추가:

```ts
test('Table Doc Word downloads a non-empty .docx via the worker', async ({ page }) => {
  await registerAndLogin(page, `export-word-${Date.now()}@example.com`)
  await openEditorWithProject(page)

  const docx = await downloadFromMenu(page, '테이블 정의서 Word')
  expect(docx.suggestedFilename()).toBe('table-definition.docx')
  expect(await streamSize(await docx.createReadStream())).toBeGreaterThan(0)
})
```

- [ ] **Step 2: E2E 실행 (도커 스택 가동, 호스트에서)**

Run: `cd frontend && VITE_PROXY_TARGET=http://localhost:4000 npx playwright test export --project=chromium --reporter=line`
Expected: 모든 export 테스트 PASS (Word/Excel/PDF/다이어그램/미리보기). 특히 Word·Excel이 실 브라우저(워커 또는 폴백)에서 비어있지 않은 파일을 생성. 도커 스택이 없으면 미실행으로 보고(G3) — 단위 테스트(Task 2–3)가 핵심 생성 로직을 커버함을 명시.

- [ ] **Step 3: 커밋**

```bash
git add frontend/e2e/export.spec.ts
git commit -m "test(e2e): Table Doc Word export downloads a non-empty .docx"
```

---

## Self-Review

**Spec coverage:**
- §3 DOCX 추가 + XLSX exceljs 교체 → Task 2, 3. ✓
- §4 공통 스타일(색·테두리·너비) 단일 상수 → Task 1, 소비 Task 2·3. ✓
- §5 파일/구조(빌더·워커·래퍼·index·UI·i18n·deps) → Task 1–5. ✓
- §6 async 파급(xlsx async, 워커/래퍼/테스트 await) → Task 2(테스트 await), Task 4(워커·래퍼 await). ✓
- §7 테스트(xlsx 되읽기·docx 스모크·E2E) → Task 2, 3, 6. ✓
- §8 위험(exceljs/docx 워커) → Task 4 폴백 + Task 6 E2E가 커버; 단위테스트(node)는 메인스레드 동작 보장. ✓
- §9 범위 밖(개별 headerColor/zebra/PDF변경) → 계획에 없음. ✓

**Placeholder scan:** TBD/TODO 없음. 모든 코드 스텝에 실제 코드. Task 6의 "도커 없으면 미실행 보고"는 환경 의존 사실 안내(플레이스홀더 아님).

**Type consistency:**
- `buildTableDocXlsxBlob(model, labels): Promise<Blob>`(async) — Task 2 정의 ↔ 워커/래퍼 await(Task 4) ↔ 테스트 await(Task 2). ✓
- `buildTableDocDocxBlob(model, labels): Promise<Blob>` — Task 3 정의 ↔ index export(Task 4) ↔ 워커/래퍼 docx 분기(Task 4) ↔ UI `buildTableDocBlob('docx', …)`(Task 5). ✓
- `TableDocExportKind = 'xlsx'|'pdf'|'docx'` — Task 4 정의 ↔ `download(kind, …)`(TableDocViewHost, 기존) ↔ ExportMenu `buildTableDocBlob('docx', …)`. ✓
- `tableDocStyle` exports(`HEADER_FILL/HEADER_TEXT/GRID_BORDER/STANDARD_COLUMN_WIDTHS/docxColumnPercents`) — Task 1 정의 ↔ Task 2·3 소비. ✓
- i18n `exportMenu.tableDocWord`, `tableDoc.downloadWord` — Task 5에서 ko/en 양쪽 추가 ↔ ExportMenu/TableDocView 소비. ✓
