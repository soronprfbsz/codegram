/**
 * Normalized, framework-agnostic DBML schema model.
 * entities layer: plain TS types only, imports nothing upward and nothing
 * from @dbml/core (those internal types are confined to lib/parse.ts).
 *
 * Plan 3b (React Flow) and Plan 4 (Layout) consume THIS shape. Keys are
 * stable and name-based per ADR-0004 so Layout reconciles by name, not by id.
 */

/** A column within a table. */
export interface DbmlColumn {
  /** Stable key: `${schema}.${table}.${name}`. */
  id: string
  name: string
  /** The DBML type name, e.g. "integer", "varchar", or an enum name. */
  type: string
  /** Primary key. */
  pk: boolean
  /** NOT NULL constraint. */
  notNull: boolean
  /** UNIQUE constraint. */
  unique: boolean
  /** Auto-increment / serial. */
  increment: boolean
  /** Default value rendered as a string, when present. */
  default?: string
  /** Column-level note/comment, when present. */
  note?: string
  /** True when the column participates in any relationship endpoint. */
  isFk: boolean
}

/** A table (entity) with its columns. */
export interface DbmlTable {
  /** Stable key: `${schema}.${name}`. */
  id: string
  name: string
  /** Owning schema name (always set; defaults to "public"). */
  schema: string
  /** Table-level note/comment, when present. */
  note?: string
  /** Header color (hex, e.g. "#3498db"), when set via [headercolor: ...]. */
  headerColor?: string
  columns: DbmlColumn[]
}

/**
 * Ordered crow-foot cardinality between the two endpoints of a relationship.
 * Read as `${from}-${to}` where "1" = one side, "n" = many side.
 */
export type DbmlRelation = '1-1' | '1-n' | 'n-1' | 'n-n'

/** A relationship (foreign-key reference) between two tables. */
export interface DbmlRef {
  /** Stable key derived from both endpoints. */
  id: string
  /** Relationship name, when explicitly given. */
  name?: string
  /** Source table name (endpoint index 0). */
  fromTable: string
  /** Source schema name (endpoint index 0). */
  fromSchema: string
  /** Source column names (length > 1 for composite FKs), order preserved. */
  fromColumns: string[]
  /** Target table name (endpoint index 1). */
  toTable: string
  /** Target schema name (endpoint index 1). */
  toSchema: string
  /** Target column names (length > 1 for composite FKs), order preserved. */
  toColumns: string[]
  /** Ordered cardinality `${from}-${to}`. */
  relation: DbmlRelation
}

/** A single value within an enum. */
export interface DbmlEnumValue {
  name: string
  note?: string
}

/** An enum type. */
export interface DbmlEnum {
  name: string
  schema: string
  values: DbmlEnumValue[]
  note?: string
}

/** A table group (logical cluster, colored region in 3b). */
export interface DbmlTableGroup {
  name: string
  /** Group color (hex), when set via [color: ...]. */
  color?: string
  /** Member table names. */
  tables: string[]
  note?: string
}

/** A standalone sticky note. */
export interface DbmlNote {
  name: string
  content: string
  /** Note header color, when set. */
  headerColor?: string
}

/** The fully normalized schema produced by a successful parse. */
export interface DbmlSchema {
  tables: DbmlTable[]
  refs: DbmlRef[]
  enums: DbmlEnum[]
  tableGroups: DbmlTableGroup[]
  notes: DbmlNote[]
}

/** A single parse diagnostic. line/column are 1-indexed when present. */
export interface DbmlParseError {
  message: string
  line?: number
  column?: number
}

/**
 * Discriminated result of parseDbml. The adapter NEVER throws; on invalid
 * DBML it returns { ok: false, errors }.
 */
export type DbmlParseResult =
  | { ok: true; schema: DbmlSchema }
  | { ok: false; errors: DbmlParseError[] }
