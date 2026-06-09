import { importer, CompilerError } from '@dbml/core'
import type { DbmlParseError } from '../model/types'
import type { SqlDialect, SqlImportResult } from '../model/sqlTypes'
import { SQL_DIALECTS } from '../model/sqlTypes'

/** Convert a CompilerError's diags into our parse-error shape.
 *  diag.message aliases diag.text at runtime; line/column come from
 *  diag.location.start. Co-located per-adapter; NOT barrel-exported. */
function toSqlErrors(err: CompilerError, fallback: string): DbmlParseError[] {
  const diags = Array.isArray(err.diags) ? err.diags : []
  if (diags.length === 0) {
    return [{ message: fallback }]
  }
  return diags.map((diag) => {
    const start = diag.location?.start
    return {
      message: diag.message,
      line: typeof start?.line === 'number' ? start.line : undefined,
      column: typeof start?.column === 'number' ? start.column : undefined,
    }
  })
}

/**
 * Convert a SQL schema string into DBML text for the given dialect. Pure and
 * error-safe: NEVER throws — on malformed SQL it returns { ok: false, errors }.
 * entities layer: one of the only places @dbml/core is imported (ADR-0002).
 *
 * @dbml/core returns "" for empty/whitespace input AND for DDL with no tables
 * (e.g. CREATE VIEW only), without throwing; both surface as a no-tables error.
 */
export function importSqlToDbml(sql: string, dialect: SqlDialect): SqlImportResult {
  try {
    const dbml = importer.import(sql, SQL_DIALECTS[dialect].importFormat)
    if (!dbml || dbml.trim().length === 0) {
      return { ok: false, errors: [{ message: 'No tables found in SQL input' }] }
    }
    return { ok: true, dbml }
  } catch (err) {
    if (err instanceof CompilerError) {
      return { ok: false, errors: toSqlErrors(err, 'Failed to import SQL') }
    }
    return {
      ok: false,
      errors: [
        { message: err instanceof Error ? err.message : 'Failed to import SQL' },
      ],
    }
  }
}
