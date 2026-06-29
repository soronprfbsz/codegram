import ExcelJS from 'exceljs'
import type { TableDocModel, TableDocTable } from '@/entities/table-doc'
import type { TableDocLabels } from './labels'
import { HEADER_FILL, HEADER_TEXT, GRID_BORDER } from './tableDocStyle'

/** Column widths (chars) for the 8-column 테이블정의서 form: No · 컬럼ID · 타입 ·
 *  길이 · NULL · KEY · DEFAULT · 설명. */
const FORM_COLS = 8
const FORM_COLUMN_WIDTHS = [6, 24, 14, 8, 12, 9, 16, 30]

const MAX_SHEET_NAME = 31
const clampSheetName = (name: string): string => name.slice(0, MAX_SHEET_NAME)

/** Split a DBML type string into its bare name and parenthesized length, e.g.
 *  `varchar(255)` -> `{ varchar, 255 }`, `numeric(10,2)` -> `{ numeric, 10,2 }`,
 *  `int` -> `{ int, '' }`. The parser stores the length inside `type`. */
export function splitTypeLength(type: string): { typeName: string; length: string } {
  const m = /^([^(]*)\(([^)]*)\)\s*$/.exec(type)
  if (!m) return { typeName: type.trim(), length: '' }
  return { typeName: m[1].trim(), length: m[2].trim() }
}

/** Render the KEY cell from the column's key flags, combined in PK,UK,FK order
 *  (e.g. a column that is both PK and FK -> `PK,FK`; none -> ''). */
export function keyLabel(col: { pk: boolean; unique: boolean; fk: boolean }): string {
  const parts: string[] = []
  if (col.pk) parts.push('PK')
  if (col.unique) parts.push('UK')
  if (col.fk) parts.push('FK')
  return parts.join(',')
}

/** Split a schema string into a DB name + schema name on the FIRST underscore
 *  (`hawkeye_core` -> `{ hawkeye, core }`). With no underscore the DB name is
 *  blank and the whole value is the schema name (`public` -> `{ '', public }`). */
export function splitSchema(schema: string): { dbName: string; schemaName: string } {
  const i = schema.indexOf('_')
  if (i < 0) return { dbName: '', schemaName: schema }
  return { dbName: schema.slice(0, i), schemaName: schema.slice(i + 1) }
}

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

/** Bordered + filled + bold header cell (for the form's label cells). */
function fillHeaderCell(cell: ExcelJS.Cell): void {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_FILL}` } }
  cell.font = { bold: true, color: { argb: `FF${HEADER_TEXT}` } }
  cell.border = BORDER
}

/** Border every cell A..H of a form row (covers merged/empty cells eachCell skips). */
function borderFormRow(row: ExcelJS.Row): void {
  for (let c = 1; c <= FORM_COLS; c++) row.getCell(c).border = BORDER
}

/**
 * Write one table's "테이블정의서" form block: a merged title row, a 2x2 metadata
 * grid (주제영역명/테이블명, DB명/스키마명) + full-width 테이블설명, the body column
 * header (No·컬럼ID·타입·길이·NULL·KEY·DEFAULT·설명) and one row per column, an
 * optional CHECK sub-table, a trailing 기타 row, then a blank separator.
 * `groupName` fills 주제영역명 (the table's owning group / "미분류").
 */
function writeTableBlock(
  ws: ExcelJS.Worksheet,
  table: TableDocTable,
  labels: TableDocLabels,
  groupName: string,
): void {
  const f = labels.form

  // Title row — merged across all columns, centered.
  const titleRow = ws.addRow([f.title])
  ws.mergeCells(titleRow.number, 1, titleRow.number, FORM_COLS)
  fillHeaderCell(titleRow.getCell(1))
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  borderFormRow(titleRow)

  // Metadata grid: A=label, B:D=value, E=label, F:H=value.
  const { dbName, schemaName } = splitSchema(table.schema)
  const metaPairRow = (leftLabel: string, leftVal: string, rightLabel: string, rightVal: string) => {
    const r = ws.addRow([leftLabel, leftVal, '', '', rightLabel, rightVal, '', ''])
    ws.mergeCells(r.number, 2, r.number, 4)
    ws.mergeCells(r.number, 6, r.number, 8)
    borderFormRow(r)
    fillHeaderCell(r.getCell(1))
    fillHeaderCell(r.getCell(5))
  }
  metaPairRow(f.subjectArea, groupName, f.tableName, table.name)
  metaPairRow(f.dbName, dbName, f.schemaName, schemaName)

  // 테이블설명 — A=label, B:H=value.
  const descRow = ws.addRow([f.tableDesc, table.note])
  ws.mergeCells(descRow.number, 2, descRow.number, FORM_COLS)
  borderFormRow(descRow)
  fillHeaderCell(descRow.getCell(1))

  // Body column header + one row per column.
  const headerRow = ws.addRow([
    f.no, f.colId, f.type, f.length, f.nullable, f.key, f.defaultVal, f.desc,
  ])
  styleHeader(headerRow)
  table.columns.forEach((col, i) => {
    const { typeName, length } = splitTypeLength(col.type)
    const r = ws.addRow([
      i + 1,
      col.name,
      typeName,
      length,
      col.notNull ? 'NOT NULL' : '',
      keyLabel(col),
      col.default ?? '',
      col.note,
    ])
    borderFormRow(r)
  })

  // Optional CHECK constraints sub-table (kept from the prior format).
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

  // Trailing 기타 row — A=label, B:H=blank value.
  const etcRow = ws.addRow([f.etc])
  ws.mergeCells(etcRow.number, 2, etcRow.number, FORM_COLS)
  borderFormRow(etcRow)
  fillHeaderCell(etcRow.getCell(1))

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
  const used = new Set<string>([clampSheetName(labels.overviewSheet), clampSheetName(labels.enumsSheet)])

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
    ws.columns = FORM_COLUMN_WIDTHS.map((w) => ({ width: w }))
    for (const t of g.tables) writeTableBlock(ws, t, labels, g.name)
  }

  // 3) Ungrouped sheet (only when there are ungrouped tables).
  if (ungrouped.length > 0) {
    const ws = wb.addWorksheet(uniqueSheetName(labels.ungroupedSheet, used))
    ws.columns = FORM_COLUMN_WIDTHS.map((w) => ({ width: w }))
    for (const t of ungrouped) writeTableBlock(ws, t, labels, labels.ungroupedSheet)
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
