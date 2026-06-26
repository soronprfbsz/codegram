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
