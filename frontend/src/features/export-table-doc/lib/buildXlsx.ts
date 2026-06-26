import * as XLSX from 'xlsx'
import { columnRow, type TableDocModel } from '@/entities/table-doc'
import type { TableDocLabels } from './labels'

/** Excel worksheet names are capped at 31 characters. */
const MAX_SHEET_NAME = 31

function clampSheetName(name: string): string {
  return name.slice(0, MAX_SHEET_NAME)
}

/**
 * Produce a unique worksheet name ≤31 chars. `book_append_sheet` THROWS on a
 * duplicate name, and two valid tables can collide after clamping (cross-schema
 * same name, or two names sharing the first 31 chars). On collision, append a
 * `~N` suffix, trimming the base so the total stays within the 31-char limit.
 */
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

/**
 * Pure: build an .xlsx Blob from the derived table-doc model. One worksheet
 * per table (sheet name = table name, clamped to 31 chars and de-duplicated),
 * holding the standard column set, plus a final `Enums` sheet. No download,
 * no React.
 */
export function buildTableDocXlsxBlob(model: TableDocModel, labels: TableDocLabels): Blob {
  const workbook = XLSX.utils.book_new()
  // Reserve the trailing enums sheet name so a table with that name is
  // de-duplicated instead of colliding with it.
  const usedSheetNames = new Set<string>([labels.enumsSheet])

  for (const table of model.tables) {
    const aoa: string[][] = [
      [...labels.columnHeaders],
      ...table.columns.map(columnRow),
    ]
    // CHECK constraints: appended below the columns in the same sheet (blank-row
    // separated, then a titled header) so the export matches the HTML preview.
    const checks = Array.isArray(table.checks) ? table.checks : []
    if (checks.length > 0) {
      aoa.push([], [labels.checks])
      aoa.push([labels.checkName, labels.checkValues, labels.checkExpression])
      for (const chk of checks) {
        aoa.push([chk.name, chk.values.join(', '), chk.expression])
      }
    }
    const sheet = XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(
      workbook,
      sheet,
      uniqueSheetName(table.name, usedSheetNames),
    )
  }

  const enumAoa: string[][] = [[labels.enumColEnum, labels.enumColValue, labels.enumColNote]]
  for (const en of model.enums) {
    for (const value of en.values) {
      enumAoa.push([`${en.schema}.${en.name}`, value.name, value.note])
    }
  }
  const enumSheet = XLSX.utils.aoa_to_sheet(enumAoa)
  XLSX.utils.book_append_sheet(workbook, enumSheet, clampSheetName(labels.enumsSheet))

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
