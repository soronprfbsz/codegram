import type { DbmlSchema, DbmlTable } from '@/entities/dbml'

/** A display-ready group for the Table names list. */
export interface DisplayGroup {
  /** Unique key (group name or '__ungrouped'). */
  key: string
  /** Human-readable label. */
  label: string
  /** CSS color string — group.color if set, else cycled from the palette. */
  color: string
  /** Tables that belong to this group, in DBML declaration order. */
  tables: DbmlTable[]
}

/**
 * 5색 순환 팔레트. 값은 테마별 CSS 변수(`--erd-group-*`, index.css 라이트/다크)
 * 단일 출처를 참조한다 — hex를 여기 중복 정의하면 다크에서 라이트용 짙은 색이
 * 그대로 쓰여 저휘도로 묻힌다(G1). CSS 컨텍스트(color-mix/배경/글자색)에서만
 * 소비되므로 var()로 충분하다.
 */
const COLOR_PALETTE = [
  'var(--erd-group-common)',
  'var(--erd-group-account)',
  'var(--erd-group-customer)',
  'var(--erd-group-release)',
  'var(--erd-group-resource)',
] as const

/**
 * Derive an ordered list of display groups from a `DbmlSchema`.
 *
 * - For each `schema.tableGroups` entry: label = group name, color = group.color
 *   if present, else COLOR_PALETTE[index % 5].
 *   tables = the group's member DbmlTable objects (resolved by DbmlTable.id which
 *   matches DbmlTableGroup.tables entries, i.e. `${schema}.${table}`).
 * - Tables not in ANY named group → trailing `__ungrouped` bucket (omitted if
 *   empty).
 * - Ordering is deterministic: named groups first in DBML declaration order,
 *   ungrouped last.
 */
export function deriveDisplayGroups(schema: DbmlSchema): DisplayGroup[] {
  // Build a set of table ids that are already assigned to a named group.
  const assignedIds = new Set<string>()

  const namedGroups: DisplayGroup[] = schema.tableGroups.map((group, index) => {
    const color = group.color ?? COLOR_PALETTE[index % COLOR_PALETTE.length]

    // Resolve group member table ids to DbmlTable objects.
    const tables: DbmlTable[] = group.tables
      .map((tableId) => {
        const found = schema.tables.find((t) => t.id === tableId)
        if (found) assignedIds.add(found.id)
        return found
      })
      .filter((t): t is DbmlTable => t !== undefined)

    return { key: group.name, label: group.name, color, tables }
  })

  // Collect tables not assigned to any named group.
  const ungrouped = schema.tables.filter((t) => !assignedIds.has(t.id))

  if (ungrouped.length > 0) {
    namedGroups.push({
      key: '__ungrouped',
      label: 'Ungrouped',
      color: 'var(--erd-text-3)',
      tables: ungrouped,
    })
  }

  return namedGroups
}
