import type { DbmlSchema } from '../model/types'

/** A single matching table, with why it matched and which columns to highlight. */
export interface TableSearchMatch {
  tableId: string
  /**
   * Short hint about WHY the table matched, shown on the list row. Null when the
   * table name itself matched — the name is already visible, so no hint is needed.
   */
  hint: string | null
  /**
   * Column ids (`schema.table.column`) to highlight on navigate — columns whose
   * name or note contained the query.
   */
  matchedColumnIds: string[]
}

/**
 * Case-insensitive substring search over table/column names and table/column
 * notes. Returns a Map keyed by table id (matching tables only), in schema
 * declaration order. A blank/whitespace query returns an empty map.
 *
 * Hint priority: table name (no hint) → column name → table note → column note.
 */
export function searchTables(
  schema: DbmlSchema | undefined,
  query: string,
): Map<string, TableSearchMatch> {
  const result = new Map<string, TableSearchMatch>()
  const q = query.trim().toLowerCase()
  if (!schema || !q) return result

  for (const table of schema.tables) {
    const nameMatch = table.name.toLowerCase().includes(q)
    const noteMatch = !!table.note && table.note.toLowerCase().includes(q)
    const colNameMatches = table.columns.filter((c) => c.name.toLowerCase().includes(q))
    const colNoteMatches = table.columns.filter(
      (c) => !!c.note && c.note.toLowerCase().includes(q),
    )

    if (!nameMatch && !noteMatch && colNameMatches.length === 0 && colNoteMatches.length === 0) {
      continue
    }

    const matchedColumnIds = Array.from(
      new Set([...colNameMatches, ...colNoteMatches].map((c) => c.id)),
    )

    let hint: string | null
    if (nameMatch) {
      hint = null
    } else if (colNameMatches.length > 0) {
      const extra = colNameMatches.length - 1
      hint = `컬럼: ${colNameMatches[0].name}${extra > 0 ? ` +${extra}` : ''}`
    } else if (noteMatch) {
      hint = '주석 일치'
    } else {
      hint = '컬럼 주석 일치'
    }

    result.set(table.id, { tableId: table.id, hint, matchedColumnIds })
  }

  return result
}
