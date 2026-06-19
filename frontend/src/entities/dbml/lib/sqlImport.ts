import { importer, CompilerError } from '@dbml/core'
import type { SqlDialect, SqlImportResult } from '../model/sqlTypes'
import { SQL_DIALECTS } from '../model/sqlTypes'
import { compilerErrorToParseErrors } from './compilerError'
import { inlineForeignKeys } from './inlineForeignKeys'

/**
 * Convert a SQL schema string into DBML text for the given dialect. Pure and
 * error-safe: NEVER throws — on malformed SQL it returns { ok: false, errors }.
 * entities layer: one of the only places @dbml/core is imported (ADR-0002).
 *
 * @dbml/core returns "" for empty/whitespace input AND for DDL with no tables
 * (e.g. CREATE VIEW only), without throwing; both surface as a no-tables error.
 *
 * Single-column FKs are folded onto their column as inline `[ref: …]` (the
 * hand-written form); composite / delete-action FKs stay as top-level `Ref`
 * lines because DBML's inline syntax can't express them (see inlineForeignKeys).
 */
export function importSqlToDbml(sql: string, dialect: SqlDialect): SqlImportResult {
  try {
    const raw = importer.import(sql, SQL_DIALECTS[dialect].importFormat)
    if (!raw || raw.trim().length === 0) {
      return { ok: false, errors: [{ message: 'No tables found in SQL input' }] }
    }
    return { ok: true, dbml: inlineForeignKeys(raw) }
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
