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
