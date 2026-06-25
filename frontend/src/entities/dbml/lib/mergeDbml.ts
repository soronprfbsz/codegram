import { Parser, ModelExporter } from '@dbml/core'

/**
 * PURE DBML merge for DB sync (replaces the old "replace schema wholesale"
 * behavior). The INCOMING (freshly-introspected) DBML is the structural source
 * of truth — its tables/columns/types/refs/enums win, so new tables appear,
 * dropped tables disappear, and existing columns update to match the live DB.
 * On top of that authoritative structure we re-graft the CODEGRAM-only overlay
 * carried in the CURRENT DBML, which introspection can never reproduce:
 *   - TableGroups (definition + color + membership, filtered to surviving tables)
 *   - standalone Notes (sticky notes)
 *   - table/column notes + table headerColor (only where the live DB has none)
 *   - the Project block (name/note)
 *
 * `syncedSchemas` controls which schemas are governed by this sync. Tables/enums/refs
 * belonging to schemas NOT in `syncedSchemas` are preserved from CURRENT verbatim.
 * Any non-synced entities that SQLAlchemy auto-reflected into INCOMING (e.g. a
 * cross-schema FK target) are filtered out before appending the CURRENT overlay so
 * that parseJSONToDatabase never sees a duplicate and falls back to losing the data.
 * Empty `syncedSchemas` → infer from INCOMING's schema set (legacy behavior).
 *
 * Works at @dbml/core's rawDb JSON level, then re-emits canonical DBML via
 * ModelExporter. This is the SECOND place @dbml/core is touched (parse.ts is the
 * other); both keep its loose shape contained here so the rest of the app sees
 * only DBML text / DbmlSchema. Error-safe: if either side fails to parse or the
 * re-emit throws, we fall back to INCOMING (structural truth) so sync still works.
 */

/** @dbml/core rawDb is loosely shaped; we read only the verified paths. */
type RawTable = {
  name: string
  schemaName?: string | null
  fields?: Array<{ name: string; note?: unknown }>
  note?: unknown
  headerColor?: unknown
}
type RawGroupMember = { name: string; schemaName?: string | null }
type RawGroup = { tables?: RawGroupMember[] }
type RawEndpoint = { schemaName?: string | null; tableName: string }
type RawRef = { endpoints?: RawEndpoint[] }
type RawEnum = { name: string; schemaName?: string | null }
type RawDb = {
  tables?: RawTable[]
  tableGroups?: RawGroup[]
  notes?: unknown[]
  refs?: RawRef[]
  enums?: RawEnum[]
  project?: Record<string, unknown> | null
}

/** Schema-qualified key (`${schema}.${name}`), defaulting schema to "public". */
function keyOf(t: { name: string; schemaName?: string | null }): string {
  return `${t.schemaName ?? 'public'}.${t.name}`
}
function schemaOf(x: { schemaName?: string | null }): string {
  return x.schemaName ?? 'public'
}
function epKey(ep: RawEndpoint): string {
  return `${ep.schemaName ?? 'public'}.${ep.tableName}`
}

export function mergeDbml(
  current: string,
  incoming: string,
  syncedSchemas: string[],
): string {
  let rawOld: RawDb
  let rawNew: RawDb
  try {
    rawOld = Parser.parseDBMLToJSONv2(current) as unknown as RawDb
    rawNew = Parser.parseDBMLToJSONv2(incoming) as unknown as RawDb
  } catch {
    return incoming
  }

  try {
    // Schemas governed by this sync. Empty → infer from incoming (legacy behavior).
    const synced = new Set(
      syncedSchemas.length
        ? syncedSchemas
        : (rawNew.tables ?? []).map(schemaOf),
    )

    const oldTables = new Map<string, RawTable>()
    for (const t of rawOld.tables ?? []) oldTables.set(keyOf(t), t)

    // Graft notes + headerColor onto surviving tables (live DB wins where set).
    for (const nt of rawNew.tables ?? []) {
      const ot = oldTables.get(keyOf(nt))
      if (!ot) continue
      if (!nt.note && ot.note) nt.note = ot.note
      if (!nt.headerColor && ot.headerColor) nt.headerColor = ot.headerColor
      const oldFields = new Map((ot.fields ?? []).map((f) => [f.name, f]))
      for (const nf of nt.fields ?? []) {
        const of = oldFields.get(nf.name)
        if (of && !nf.note && of.note) nf.note = of.note
      }
    }

    // Within synced schemas, `incoming` is the structural truth. Drop anything
    // SQLAlchemy auto-reflected from a NON-synced schema (e.g. a cross-schema FK
    // target) — those come from `current` (the authoritative overlay) below, so
    // appending them again would duplicate and make parseJSONToDatabase throw.
    rawNew.tables = (rawNew.tables ?? []).filter((t) => synced.has(schemaOf(t)))
    rawNew.enums = (rawNew.enums ?? []).filter((e) => synced.has(schemaOf(e)))
    rawNew.refs = (rawNew.refs ?? []).filter((r) =>
      (r.endpoints ?? []).every((ep) => synced.has(ep.schemaName ?? 'public')),
    )

    // Now append the authoritative non-synced overlay from `current`.
    const preservedTables = (rawOld.tables ?? []).filter(
      (t) => !synced.has(schemaOf(t)),
    )
    rawNew.tables = [...rawNew.tables, ...preservedTables]
    const preservedEnums = (rawOld.enums ?? []).filter(
      (e) => !synced.has(schemaOf(e)),
    )
    rawNew.enums = [...rawNew.enums, ...preservedEnums]

    const finalKeys = new Set(rawNew.tables.map(keyOf))
    // Carry refs touching a preserved (non-synced) table, when both endpoints
    // still resolve in the merged set. (Cross-schema synced↔non-synced refs may
    // not survive a partial sync; re-sync both schemas to restore them.)
    const preservedRefs = (rawOld.refs ?? []).filter(
      (r) =>
        (r.endpoints ?? []).some((ep) => !synced.has(ep.schemaName ?? 'public')) &&
        (r.endpoints ?? []).every((ep) => finalKeys.has(epKey(ep))),
    )
    rawNew.refs = [...rawNew.refs, ...preservedRefs]

    // Carry table groups, dropping members absent from the FINAL table set.
    rawNew.tableGroups = (rawOld.tableGroups ?? [])
      .map((g) => ({
        ...g,
        tables: (g.tables ?? []).filter((m) => finalKeys.has(keyOf(m))),
      }))
      .filter((g) => g.tables.length > 0)

    // Carry standalone (sticky) notes verbatim — purely a Codegram overlay.
    rawNew.notes = rawOld.notes ?? []

    // Keep the old Project block (name/note) when introspection produced none.
    if (
      rawOld.project &&
      (!rawNew.project || Object.keys(rawNew.project).length === 0)
    ) {
      rawNew.project = rawOld.project
    }

    const db = Parser.parseJSONToDatabase(rawNew)
    return ModelExporter.export(db.normalize(), 'dbml')
  } catch {
    return incoming
  }
}
