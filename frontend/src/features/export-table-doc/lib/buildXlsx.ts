import * as XLSX from 'xlsx'
import type { TableDocModel, TableDocColumn } from '@/entities/table-doc'

/** Standard 테이블 정의서 column header (Korean labels), FINAL order. */
const COLUMN_HEADER = [
  '컬럼명',
  '데이터타입',
  'PK',
  'FK',
  'NN',
  'UNIQUE',
  '기본값',
  '설명',
] as const

const ENUM_HEADER = ['Enum', '값', '설명'] as const

/** 'Y' for a true flag, '' for false — keeps cells terse and printable. */
function flag(value: boolean): string {
  return value ? 'Y' : ''
}

/** Map one derived column to a worksheet row in COLUMN_HEADER order. */
function columnRow(col: TableDocColumn): string[] {
  return [
    col.name,
    col.type,
    flag(col.pk),
    flag(col.fk),
    flag(col.notNull),
    flag(col.unique),
    col.default,
    col.note,
  ]
}

/** Excel worksheet names are capped at 31 characters. */
function clampSheetName(name: string): string {
  return name.slice(0, 31)
}

/**
 * Pure: build an .xlsx Blob from the derived table-doc model. One worksheet
 * per table (sheet name = table name, clamped to 31 chars) holding the
 * standard column set, plus a final `Enums` sheet. No download, no React.
 */
export function buildTableDocXlsxBlob(model: TableDocModel): Blob {
  const workbook = XLSX.utils.book_new()

  for (const table of model.tables) {
    const aoa: string[][] = [
      [...COLUMN_HEADER],
      ...table.columns.map(columnRow),
    ]
    const sheet = XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(workbook, sheet, clampSheetName(table.name))
  }

  const enumAoa: string[][] = [[...ENUM_HEADER]]
  for (const en of model.enums) {
    for (const value of en.values) {
      enumAoa.push([`${en.schema}.${en.name}`, value.name, value.note])
    }
  }
  const enumSheet = XLSX.utils.aoa_to_sheet(enumAoa)
  XLSX.utils.book_append_sheet(workbook, enumSheet, 'Enums')

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
