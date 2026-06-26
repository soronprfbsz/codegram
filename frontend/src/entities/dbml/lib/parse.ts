import { Parser, CompilerError } from '@dbml/core'
import type {
  DbmlCheck,
  DbmlColumn,
  DbmlEnum,
  DbmlNote,
  DbmlParseResult,
  DbmlRef,
  DbmlRelation,
  DbmlSchema,
  DbmlTable,
  DbmlTableGroup,
} from '@/entities/dbml/model/types'
import { compilerErrorToParseErrors } from './compilerError'

/**
 * @dbml/core normalize() returns ID-keyed maps; we treat each as a record of
 * unknown-shaped nodes and read only the verified property paths. We keep the
 * structural typing loose here (the one place @dbml/core's shape leaks) so the
 * rest of the app sees only our normalized model.
 */
type IdMap = Record<string, Record<string, unknown>>

interface NormalizedModel {
  schemas: IdMap
  tables: IdMap
  fields: IdMap
  refs: IdMap
  endpoints: IdMap
  enums: IdMap
  enumValues: IdMap
  tableGroups: IdMap
  notes: IdMap
  indexes: IdMap
  indexColumns: IdMap
  checks: IdMap
}

/** Coerce a possibly-null/undefined string into an optional non-empty string. */
function optStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Map an endpoint's "1" | "*" relation flag to our "1" | "n" token. */
function side(relation: unknown): '1' | 'n' {
  return relation === '*' ? 'n' : '1'
}

/** Resolve a schema name from a schemaId, defaulting to "public". */
function schemaName(model: NormalizedModel, schemaId: unknown): string {
  const schema = model.schemas[String(schemaId)]
  const name = schema ? schema.name : undefined
  return typeof name === 'string' && name.length > 0 ? name : 'public'
}

/**
 * Build a table's stable, schema-qualified id (`${schema}.${name}`). This is
 * the single source of truth for DbmlTable.id; mapTableGroup reuses it so group
 * members carry the exact same key (ADR-0004 name-based reconciliation).
 */
function tableId(model: NormalizedModel, table: Record<string, unknown>): string {
  return `${schemaName(model, table.schemaId)}.${String(table.name)}`
}

/**
 * The set of endpoint ids that represent a FOREIGN-KEY column (the child side of
 * a relationship), so a column referenced BY others (e.g. a PK that other tables
 * point at) is NOT mistaken for a FK. Per ref: the FK side is the "many" (`*`)
 * endpoint; for a 1-1 (`-`, both `1`) the `from` endpoint is treated as the FK.
 */
function fkEndpointIds(model: NormalizedModel): Set<string> {
  const fk = new Set<string>()
  for (const ref of Object.values(model.refs)) {
    const ids = Array.isArray(ref.endpointIds) ? ref.endpointIds.map(String) : []
    if (ids.length !== 2) continue
    const r0 = model.endpoints[ids[0]]?.relation
    const r1 = model.endpoints[ids[1]]?.relation
    if (r0 === '*') fk.add(ids[0])
    if (r1 === '*') fk.add(ids[1])
    if (r0 !== '*' && r1 !== '*') fk.add(ids[0]) // 1-1: the from-side holds the FK
  }
  return fk
}

/**
 * Column names a table marks PK via an `indexes { col [pk] }` block (incl.
 * composite PKs). @dbml/core records these on the index, NOT on `field.pk`, so
 * without this an index-declared PK (common in SQL-imported/introspected DBML)
 * shows no PK badge.
 */
function pkColumnsFromIndexes(
  model: NormalizedModel,
  table: Record<string, unknown>,
): Set<string> {
  const pk = new Set<string>()
  const indexIds = Array.isArray(table.indexIds) ? table.indexIds : []
  for (const iid of indexIds) {
    const idx = model.indexes[String(iid)]
    if (!idx || idx.pk !== true) continue
    const columnIds = Array.isArray(idx.columnIds) ? idx.columnIds : []
    for (const cid of columnIds) {
      const col = model.indexColumns[String(cid)]
      if (col && col.type === 'column' && typeof col.value === 'string') {
        pk.add(col.value)
      }
    }
  }
  return pk
}

function mapColumn(
  field: Record<string, unknown>,
  schema: string,
  tableName: string,
  fkEndpoints: Set<string>,
  pkFromIndex: Set<string>,
): DbmlColumn {
  const name = String(field.name)
  const type = field.type as { type_name?: unknown } | undefined
  const dbdefault = field.dbdefault as { value?: unknown } | undefined
  const endpointIds = field.endpointIds
  return {
    id: `${schema}.${tableName}.${name}`,
    name,
    type:
      type && typeof type.type_name === 'string' ? type.type_name : 'unknown',
    pk: field.pk === true || pkFromIndex.has(name),
    notNull: field.not_null === true,
    unique: field.unique === true,
    increment: field.increment === true,
    default:
      dbdefault && dbdefault.value !== undefined && dbdefault.value !== null
        ? String(dbdefault.value)
        : undefined,
    note: optStr(field.note),
    isFk:
      Array.isArray(endpointIds) &&
      endpointIds.some((eid) => fkEndpoints.has(String(eid))),
  }
}

/** Table-level CHECK constraints from the table's `checkIds` (Checks block). */
function mapTableChecks(
  model: NormalizedModel,
  table: Record<string, unknown>,
): DbmlCheck[] {
  const checkIds = Array.isArray(table.checkIds) ? table.checkIds : []
  const checks: DbmlCheck[] = []
  for (const cid of checkIds) {
    const check = model.checks[String(cid)]
    const expression = check ? optStr(check.expression) : undefined
    if (expression) checks.push({ expression, name: optStr(check.name) })
  }
  return checks
}

function mapTable(
  model: NormalizedModel,
  table: Record<string, unknown>,
  fkEndpoints: Set<string>,
): DbmlTable {
  const name = String(table.name)
  const schema = schemaName(model, table.schemaId)
  const fieldIds = Array.isArray(table.fieldIds) ? table.fieldIds : []
  const pkFromIndex = pkColumnsFromIndexes(model, table)
  return {
    id: tableId(model, table),
    name,
    schema,
    note: optStr(table.note),
    headerColor: optStr(table.headerColor),
    columns: fieldIds.map((fid) =>
      mapColumn(model.fields[String(fid)], schema, name, fkEndpoints, pkFromIndex),
    ),
    checks: mapTableChecks(model, table),
  }
}

function mapRef(
  model: NormalizedModel,
  ref: Record<string, unknown>,
): DbmlRef {
  const endpointIds = Array.isArray(ref.endpointIds) ? ref.endpointIds : []
  const from = model.endpoints[String(endpointIds[0])] ?? {}
  const to = model.endpoints[String(endpointIds[1])] ?? {}
  const fromTable = String(from.tableName)
  const toTable = String(to.tableName)
  const fromSchema = optStr(from.schemaName) ?? 'public'
  const toSchema = optStr(to.schemaName) ?? 'public'
  const fromColumns = Array.isArray(from.fieldNames)
    ? from.fieldNames.map(String)
    : []
  const toColumns = Array.isArray(to.fieldNames)
    ? to.fieldNames.map(String)
    : []
  const relation = `${side(from.relation)}-${side(to.relation)}` as DbmlRelation
  return {
    id: `${fromSchema}.${fromTable}.(${fromColumns.join(',')})>${toSchema}.${toTable}.(${toColumns.join(',')})`,
    name: optStr(ref.name),
    fromTable,
    fromSchema,
    fromColumns,
    toTable,
    toSchema,
    toColumns,
    relation,
  }
}

function mapEnum(
  model: NormalizedModel,
  enumDef: Record<string, unknown>,
): DbmlEnum {
  const valueIds = Array.isArray(enumDef.valueIds) ? enumDef.valueIds : []
  return {
    name: String(enumDef.name),
    schema: schemaName(model, enumDef.schemaId),
    note: optStr(enumDef.note),
    values: valueIds.map((vid) => {
      const value = model.enumValues[String(vid)] ?? {}
      return { name: String(value.name), note: optStr(value.note) }
    }),
  }
}

function mapTableGroup(
  model: NormalizedModel,
  group: Record<string, unknown>,
): DbmlTableGroup {
  const tableIds = Array.isArray(group.tableIds) ? group.tableIds : []
  return {
    name: String(group.name),
    color: optStr(group.color),
    note: optStr(group.note),
    tables: tableIds.map((tid) => {
      const table = model.tables[String(tid)] ?? {}
      return tableId(model, table)
    }),
  }
}

function mapNote(note: Record<string, unknown>): DbmlNote {
  return {
    name: String(note.name),
    content: typeof note.content === 'string' ? note.content : '',
    headerColor: optStr(note.headerColor),
  }
}

function toSchema(model: NormalizedModel): DbmlSchema {
  const fkEndpoints = fkEndpointIds(model)
  return {
    tables: Object.values(model.tables).map((t) => mapTable(model, t, fkEndpoints)),
    refs: Object.values(model.refs).map((r) => mapRef(model, r)),
    enums: Object.values(model.enums).map((e) => mapEnum(model, e)),
    tableGroups: Object.values(model.tableGroups).map((g) =>
      mapTableGroup(model, g),
    ),
    notes: Object.values(model.notes).map((n) => mapNote(n)),
  }
}

/**
 * Parse DBML text into our normalized model. Pure and error-safe: it NEVER
 * throws — on invalid DBML it returns { ok: false, errors }. entities layer:
 * the ONLY place @dbml/core is imported; everything else sees DbmlSchema.
 */
export function parseDbml(text: string): DbmlParseResult {
  try {
    const database = new Parser().parse(text, 'dbmlv2')
    const model = database.normalize() as unknown as NormalizedModel
    return { ok: true, schema: toSchema(model) }
  } catch (err) {
    if (err instanceof CompilerError) {
      return {
        ok: false,
        errors: compilerErrorToParseErrors(err, 'Failed to parse DBML'),
      }
    }
    return {
      ok: false,
      errors: [
        {
          message:
            err instanceof Error ? err.message : 'Failed to parse DBML',
        },
      ],
    }
  }
}
