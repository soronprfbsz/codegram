import type { DbmlParseError } from './types'

/** The two SQL dialects supported BOTH ways (import + export) by @dbml/core. */
export type SqlDialect = 'postgres' | 'mysql'

/** Per-dialect descriptor: user-facing label + the EXACT @dbml/core format strings.
 *  importFormat is passed to importer.import(sql, importFormat);
 *  exportFormat is passed to exporter.export(dbml, exportFormat).
 *  For these two dialects (postgres, mysql) the import and export format strings are identical,
 *  but both are stored explicitly so the call sites never hard-code a string. */
export interface SqlDialectDescriptor {
  label: string
  importFormat: 'postgres' | 'mysql'
  exportFormat: 'postgres' | 'mysql'
}

/** value -> descriptor. Iteration order = menu/selector order. */
export const SQL_DIALECTS: Record<SqlDialect, SqlDialectDescriptor> = {
  postgres: { label: 'PostgreSQL', importFormat: 'postgres', exportFormat: 'postgres' },
  mysql: { label: 'MySQL', importFormat: 'mysql', exportFormat: 'mysql' },
}

/** Ordered list of dialect values for rendering selectors/menu items. */
export const SQL_DIALECT_VALUES: SqlDialect[] = ['postgres', 'mysql']

/** Result of importSqlToDbml. Mirrors DbmlParseResult; NEVER throws.
 *  On success carries the converted DBML string (NOT a parsed schema). */
export type SqlImportResult =
  | { ok: true; dbml: string }
  | { ok: false; errors: DbmlParseError[] }

/** Result of exportDbmlToSql. Mirrors DbmlParseResult; NEVER throws. */
export type SqlExportResult =
  | { ok: true; sql: string }
  | { ok: false; errors: DbmlParseError[] }
