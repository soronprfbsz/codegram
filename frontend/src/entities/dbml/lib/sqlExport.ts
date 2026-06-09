import { exporter, CompilerError } from '@dbml/core'
import type { SqlDialect, SqlExportResult } from '../model/sqlTypes'
import { SQL_DIALECTS } from '../model/sqlTypes'
import { compilerErrorToParseErrors } from './compilerError'

/**
 * Convert DBML text into a SQL schema string for the given dialect. Pure and
 * error-safe: NEVER throws — on invalid DBML it returns { ok: false, errors }.
 * entities layer: one of the only places @dbml/core is imported (ADR-0002).
 *
 * exporter.export takes the DBML string directly (it parses 'dbmlv2' internally)
 * and returns the SQL string for the chosen dialect.
 */
export function exportDbmlToSql(dbml: string, dialect: SqlDialect): SqlExportResult {
  try {
    const sql = exporter.export(dbml, SQL_DIALECTS[dialect].exportFormat)
    return { ok: true, sql }
  } catch (err) {
    if (err instanceof CompilerError) {
      return {
        ok: false,
        errors: compilerErrorToParseErrors(err, 'Failed to export DBML'),
      }
    }
    return {
      ok: false,
      errors: [
        { message: err instanceof Error ? err.message : 'Failed to export DBML' },
      ],
    }
  }
}
