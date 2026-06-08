import type { TableDocColumn, TableDocFkTarget } from '../model/types'

/** 'Y' for a true flag, '' for false — keeps cells terse and printable. */
export function flag(value: boolean): string {
  return value ? 'Y' : ''
}

/** One column of the standard 테이블 정의서 table. */
export interface StandardColumnDescriptor {
  /** Korean header label. */
  header: string
  /** Map a derived column to its cell string. */
  value: (col: TableDocColumn) => string
}

/**
 * The single source of truth for the standard 테이블 정의서 column set, in
 * FINAL order. Every exporter (xlsx/pdf) and the HTML view derives its header
 * row and per-column cells from this descriptor so the three never drift.
 */
export const STANDARD_COLUMNS: readonly StandardColumnDescriptor[] = [
  { header: '컬럼명', value: (c) => c.name },
  { header: '데이터타입', value: (c) => c.type },
  { header: 'PK', value: (c) => flag(c.pk) },
  { header: 'FK', value: (c) => flag(c.fk) },
  { header: 'NN', value: (c) => flag(c.notNull) },
  { header: 'UNIQUE', value: (c) => flag(c.unique) },
  { header: '기본값', value: (c) => c.default },
  { header: '설명', value: (c) => c.note },
]

/** Header row in FINAL order. */
export const STANDARD_COLUMN_HEADER: readonly string[] = STANDARD_COLUMNS.map(
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
