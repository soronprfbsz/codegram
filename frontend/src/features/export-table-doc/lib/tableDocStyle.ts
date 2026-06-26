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
