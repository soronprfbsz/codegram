import type { SqlImportResult } from '../model/sqlTypes'
import type { IntrospectedTable } from '../model/introspect'

/**
 * Quote a DBML identifier/type. Backslashes are doubled BEFORE double quotes
 * are escaped — otherwise the backslash inserted for the quote escape would
 * itself get doubled, and @dbml/core would see an unescaped quote mid-string.
 */
function q(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

/**
 * A single-quoted DBML string literal. Same backslash-before-quote escaping
 * as `q()`; newlines are neutralized to a space since @dbml/core cannot parse
 * a literal newline inside a single-quoted string (comments are advisory, so
 * collapsing to single-line is fine).
 */
function noteLiteral(s: string): string {
  return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ') + "'"
}

/**
 * Build DBML text (tables + columns only, NO relations) from an introspected
 * table list. Used for dialects with no DDL path — ClickHouse (ADR-0021).
 *
 * Types are quoted so complex ClickHouse types (LowCardinality, Enum8, Map,
 * AggregateFunction, …) survive @dbml/core parsing verbatim. A DBML Table must
 * have >=1 column, so zero-column tables are skipped. Column comments become
 * `[note: '...']`; the table engine becomes a table `Note`. Pure; never throws.
 * Lives in the entities layer, alongside the other @dbml/core-adjacent code
 * (ADR-0002: DBML generation stays in the frontend).
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
