import { Parser, CompilerError } from '@dbml/core'
import type {
  DbmlColumn,
  DbmlEnum,
  DbmlNote,
  DbmlParseError,
  DbmlParseResult,
  DbmlRef,
  DbmlRelation,
  DbmlSchema,
  DbmlTable,
  DbmlTableGroup,
} from '@/entities/dbml/model/types'

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

function mapColumn(
  field: Record<string, unknown>,
  schema: string,
  tableName: string,
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
    pk: field.pk === true,
    notNull: field.not_null === true,
    unique: field.unique === true,
    increment: field.increment === true,
    default:
      dbdefault && dbdefault.value !== undefined && dbdefault.value !== null
        ? String(dbdefault.value)
        : undefined,
    note: optStr(field.note),
    isFk: Array.isArray(endpointIds) && endpointIds.length > 0,
  }
}

function mapTable(
  model: NormalizedModel,
  table: Record<string, unknown>,
): DbmlTable {
  const name = String(table.name)
  const schema = schemaName(model, table.schemaId)
  const fieldIds = Array.isArray(table.fieldIds) ? table.fieldIds : []
  return {
    id: `${schema}.${name}`,
    name,
    schema,
    note: optStr(table.note),
    headerColor: optStr(table.headerColor),
    columns: fieldIds.map((fid) =>
      mapColumn(model.fields[String(fid)], schema, name),
    ),
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
      return String(table.name)
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
  return {
    tables: Object.values(model.tables).map((t) => mapTable(model, t)),
    refs: Object.values(model.refs).map((r) => mapRef(model, r)),
    enums: Object.values(model.enums).map((e) => mapEnum(model, e)),
    tableGroups: Object.values(model.tableGroups).map((g) =>
      mapTableGroup(model, g),
    ),
    notes: Object.values(model.notes).map((n) => mapNote(n)),
  }
}

/** Convert a CompilerError's diags into our parse-error shape. */
function toErrors(err: CompilerError): DbmlParseError[] {
  const diags = Array.isArray(err.diags) ? err.diags : []
  if (diags.length === 0) {
    // CompilerError has no `message` property and does not extend Error;
    // its diagnostics live on `.diags`. With no diags, fall back to a literal.
    return [{ message: 'Failed to parse DBML' }]
  }
  return diags.map((diag) => {
    const start = diag.location?.start
    return {
      message: diag.message,
      line: typeof start?.line === 'number' ? start.line : undefined,
      column: typeof start?.column === 'number' ? start.column : undefined,
    }
  })
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
      return { ok: false, errors: toErrors(err) }
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
