import type { SqlImportResult } from '../model/sqlTypes'
import type { IntrospectedTable } from '../model/introspect'

/** Quote a DBML identifier/type, backslash-escaping inner double quotes. */
function q(s: string): string {
  return '"' + s.replace(/"/g, '\\"') + '"'
}

/** A single-quoted DBML string literal, backslash-escaping inner apostrophes. */
function noteLiteral(s: string): string {
  return "'" + s.replace(/'/g, "\\'") + "'"
}

/**
 * Build DBML text (tables + columns only, NO relations) from an introspected
 * table list. Used for dialects with no DDL path — ClickHouse (ADR-0021).
 *
 * Types are quoted so complex ClickHouse types (LowCardinality, Enum8, Map,
 * AggregateFunction, …) survive @dbml/core parsing verbatim. A DBML Table must
 * have >=1 column, so zero-column tables are skipped. Column comments become
 * `[note: '...']`; the table engine becomes a table `Note`. Pure; never throws.
 * entities layer, alongside the other @dbml/core-adjacent code (ADR-0002:
 * DBML generation stays in the frontend).
 */
export function buildDbmlFromTables(tables: IntrospectedTable[]): SqlImportResult {
  const blocks = tables
    .filter((t) => t.columns.length > 0)
    .map((t) => {
      const cols = t.columns.map((c) => {
        const note = c.comment ? ` [note: ${noteLiteral(c.comment)}]` : ''
        return `  ${q(c.name)} ${q(c.type)}${note}`
      })
      const engineNote = t.engine ? `\n  Note: ${noteLiteral(t.engine)}` : ''
      return `Table ${q(t.name)} {\n${cols.join('\n')}${engineNote}\n}`
    })
  if (blocks.length === 0) {
    return { ok: false, errors: [{ message: 'No tables found' }] }
  }
  return { ok: true, dbml: blocks.join('\n\n') }
}
