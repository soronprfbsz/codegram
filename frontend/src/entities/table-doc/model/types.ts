/**
 * Derived 테이블 정의서 (table-definition) model.
 * entities layer: plain TS types only. This is the DERIVED shape consumed by
 * the table-doc exporters and the HTML view — it imports NOTHING (not even the
 * DbmlSchema family; the adapter in lib/deriveTableDoc.ts maps source -> here).
 */

/** One row of the standard 테이블 정의서 column set. */
export interface TableDocColumn {
  /** 컬럼명 — DbmlColumn.name */
  name: string
  /** 데이터타입 — DbmlColumn.type */
  type: string
  /** PK — DbmlColumn.pk */
  pk: boolean
  /** FK — true when this column is the FK-holding side of any ref (derived from refs, NOT DbmlColumn.isFk). */
  fk: boolean
  /** NN (NOT NULL) — DbmlColumn.notNull */
  notNull: boolean
  /** UNIQUE — DbmlColumn.unique */
  unique: boolean
  /** 기본값 — DbmlColumn.default ('' when absent). */
  default: string
  /** 설명 — DbmlColumn.note ('' when absent). */
  note: string
}

/** A foreign-key relationship target rendered in a table's FK section. */
export interface TableDocFkTarget {
  /** Local column names on THIS table that hold the FK (composite => length > 1, order preserved). */
  columns: string[]
  /** Referenced (target) table name. */
  targetTable: string
  /** Referenced target schema. */
  targetSchema: string
  /** Referenced target column names (zipped 1:1 with `columns`). */
  targetColumns: string[]
}

/** One table section of the document. */
export interface TableDocTable {
  /** Stable key `${schema}.${name}` — equals DbmlTable.id. */
  id: string
  /** Owning schema (defaults to "public"). */
  schema: string
  name: string
  /** Table-level note ('' when absent). */
  note: string
  columns: TableDocColumn[]
  /** FK relationships where THIS table is the FK-holding side (may be empty). */
  fkTargets: TableDocFkTarget[]
  /** Table-level CHECK constraints (may be empty). */
  checks: TableDocCheck[]
}

/** One table-level CHECK constraint in the table detail. */
export interface TableDocCheck {
  /** The raw check expression. */
  expression: string
  /** Constraint name ('' when absent). */
  name: string
  /** Allowed values when the check is an enum-style list (`IN`/`ANY(ARRAY)`);
   *  empty for non-enum checks (e.g. numeric ranges). */
  values: string[]
}

/** One value within an enum in the Enum list section. */
export interface TableDocEnumValue {
  name: string
  /** '' when absent. */
  note: string
}

/** One enum in the Enum list section. */
export interface TableDocEnum {
  /** Stable key `${schema}.${name}`. */
  id: string
  schema: string
  name: string
  /** '' when absent. */
  note: string
  values: TableDocEnumValue[]
}

/** The full derived document model — the single input to every table-doc exporter and the HTML view. */
export interface TableDocModel {
  tables: TableDocTable[]
  enums: TableDocEnum[]
}
