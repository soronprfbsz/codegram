import { importer, CompilerError } from '@dbml/core'
import type { SqlDialect, SqlImportResult } from '../model/sqlTypes'
import { SQL_DIALECTS } from '../model/sqlTypes'
import { compilerErrorToParseErrors } from './compilerError'

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
      return {
        ok: false,
        errors: compilerErrorToParseErrors(err, 'Failed to import SQL'),
      }
    }
    return {
      ok: false,
      errors: [
        { message: err instanceof Error ? err.message : 'Failed to import SQL' },
      ],
    }
  }
}
