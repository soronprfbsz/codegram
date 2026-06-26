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
      const checkTitle = ws.addRow([labels.checks])
      checkTitle.getCell(1).font = { bold: true }
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
