import type { TableDocColumn, TableDocFkTarget } from '../model/types'

/** 'Y' for a true flag, '' for false — keeps cells terse and printable. */
export function flag(value: boolean): string {
  return value ? 'Y' : ''
}

/** One column of the standard 테이블 정의서 table. */
export interface StandardColumnDescriptor {
  /** i18n key for the header label (translated by the view / exporters). */
  header: string
  /** Map a derived column to its cell string. */
  value: (col: TableDocColumn) => string
}

/**
 * The single source of truth for the standard 테이블 정의서 column set, in
 * FINAL order. Every exporter (xlsx/pdf/docx) and the HTML view derives its header
 * row and per-column cells from this descriptor so they never drift.
 * `header` is an i18n KEY (not a literal) — consumers translate via `t()` so the
 * preview and exports follow the active language.
 */
export const STANDARD_COLUMNS: readonly StandardColumnDescriptor[] = [
  { header: 'tableDoc.colName', value: (c) => c.name },
  { header: 'tableDoc.colType', value: (c) => c.type },
  { header: 'tableDoc.colPk', value: (c) => flag(c.pk) },
  { header: 'tableDoc.colFk', value: (c) => flag(c.fk) },
  { header: 'tableDoc.colNn', value: (c) => flag(c.notNull) },
  { header: 'tableDoc.colUnique', value: (c) => flag(c.unique) },
  { header: 'tableDoc.colDefault', value: (c) => c.default },
  { header: 'tableDoc.colNote', value: (c) => c.note },
]

/** Header i18n keys in FINAL order (translate via `t()` at the use site). */
export const STANDARD_COLUMN_HEADER_KEYS: readonly string[] = STANDARD_COLUMNS.map(
  (c) => c.header,
)

/** Map one derived column to a row in STANDARD_COLUMNS order. */
export function columnRow(col: TableDocColumn): string[] {
  return STANDARD_COLUMNS.map((c) => c.value(col))
}

/** Local FK-holding columns on this table, comma-joined (e.g. `a, b`). */
export function fkLocalCell(fk: TableDocFkTarget): string {
  return fk.columns.join(', ')
}

/**
 * Referenced side, grouped so the target columns clearly belong to the target
 * table: `public.orgs(id)` for a single column, `public.orgs(x, y)` for a
 * composite FK. Shared by the PDF exporter and the HTML view.
 */
export function fkTargetCell(fk: TableDocFkTarget): string {
  return `${fk.targetSchema}.${fk.targetTable}(${fk.targetColumns.join(', ')})`
}
