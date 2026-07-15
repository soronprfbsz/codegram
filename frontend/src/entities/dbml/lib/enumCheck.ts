/**
 * Parse an "enum-style" CHECK expression — the common Postgres/SQL pattern of
 * constraining a column to a fixed value set:
 *   failure_reason = ANY (ARRAY['a'::text, 'b'::text, ...])   (Postgres)
 *   failure_reason IN ('a', 'b', ...)                          (standard SQL)
 * Returns the constrained column name (last dotted segment, unquoted) and the
 * ordered allowed values. Both are null/[] when the expression is not an
 * enum-style list (e.g. a numeric range check). Pure, no I/O.
 *
 * Single source for both the table-doc "Allowed values" display and the ERD
 * canvas synthesized-enum node.
 */
import type { DbmlSchema, DbmlTable } from '../model/types'

export interface EnumCheck {
  /** Constrained column (last dotted segment, unquoted), or null if unparsed. */
  column: string | null
  /** Allowed values in order; [] when not an enum-style check. */
  values: string[]
}

export function parseEnumCheck(expression: string): EnumCheck {
  let colRaw: string | null = null
  let inner: string | null = null

  const anyMatch = expression.match(
    /([\w".]+)\s*=\s*ANY\s*\(\s*ARRAY\s*\[([\s\S]*)\]\s*\)/i,
  )
  if (anyMatch) {
    colRaw = anyMatch[1]
    inner = anyMatch[2]
  } else {
    const inMatch = expression.match(/([\w".]+)\s+IN\s*\(([\s\S]*)\)/i)
    if (inMatch) {
      colRaw = inMatch[1]
      inner = inMatch[2]
    }
  }
  if (inner === null) return { column: null, values: [] }

  // Pull single-quoted literals, collapsing the SQL '' escape; casts (::text)
  // and separators between literals are ignored.
  const values: string[] = []
  const re = /'((?:[^']|'')*)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(inner)) !== null) {
    values.push(m[1].replace(/''/g, "'"))
  }

  const column = colRaw ? (colRaw.replace(/"/g, '').split('.').pop() ?? null) : null
  return { column, values }
}

/** Allowed values only (table-doc convenience). */
export function extractEnumCheckValues(expression: string): string[] {
  return parseEnumCheck(expression).values
}

/** One CHECK-synthesized enum: its owning table, constrained column, values. */
export interface SynthesizedEnumCheck {
  table: DbmlTable
  column: string
  values: string[]
}

/**
 * The enum-style CHECK constraints across a schema that render as synthesized
 * enums — a column pinned to a value set (`col = ANY(ARRAY[…])` / `col IN (…)`)
 * whose constrained column actually exists on the table. Single source for BOTH
 * the ERD canvas synthesized-enum nodes and the schema-summary Enum count, so
 * the two never drift. Pure, no I/O.
 */
export function synthesizedEnumChecks(schema: DbmlSchema): SynthesizedEnumCheck[] {
  const result: SynthesizedEnumCheck[] = []
  for (const table of schema.tables) {
    const checks = Array.isArray(table.checks) ? table.checks : []
    for (const check of checks) {
      const { column, values } = parseEnumCheck(check.expression)
      if (!column || values.length === 0) continue
      if (!table.columns.some((c) => c.name === column)) continue
      result.push({ table, column, values })
    }
  }
  return result
}
