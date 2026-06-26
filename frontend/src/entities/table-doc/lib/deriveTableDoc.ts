import { extractEnumCheckValues } from '@/entities/dbml'
import type { DbmlSchema, DbmlRef } from '@/entities/dbml'
import type {
  TableDocColumn,
  TableDocEnum,
  TableDocFkTarget,
  TableDocModel,
  TableDocTable,
} from '../model/types'

/** A single FK endpoint contribution for one table id. */
interface FkContribution {
  /** Local column names on this table that hold the FK. */
  columns: string[]
  target: TableDocFkTarget
}

/**
 * Which endpoint(s) of a ref hold the FK, derived from `relation` (NOT endpoint
 * order, NOT DbmlColumn.isFk):
 *   1-n => the `to` endpoint holds the FK
 *   n-1 => the `from` endpoint holds the FK
 *   1-1 / n-n => BOTH endpoints hold the FK
 */
function fkContributions(ref: DbmlRef): { tableId: string; contribution: FkContribution }[] {
  const fromId = `${ref.fromSchema}.${ref.fromTable}`
  const toId = `${ref.toSchema}.${ref.toTable}`

  const fromHoldsFk: FkContribution = {
    columns: ref.fromColumns,
    target: {
      columns: ref.fromColumns,
      targetTable: ref.toTable,
      targetSchema: ref.toSchema,
      targetColumns: ref.toColumns,
    },
  }
  const toHoldsFk: FkContribution = {
    columns: ref.toColumns,
    target: {
      columns: ref.toColumns,
      targetTable: ref.fromTable,
      targetSchema: ref.fromSchema,
      targetColumns: ref.fromColumns,
    },
  }

  switch (ref.relation) {
    case 'n-1':
      return [{ tableId: fromId, contribution: fromHoldsFk }]
    case '1-n':
      return [{ tableId: toId, contribution: toHoldsFk }]
    case '1-1':
    case 'n-n':
      return [
        { tableId: fromId, contribution: fromHoldsFk },
        { tableId: toId, contribution: toHoldsFk },
      ]
    default: {
      const _exhaustive: never = ref.relation
      throw new Error(`unhandled relation: ${String(_exhaustive)}`)
    }
  }
}

/** Pure: derive the 테이블 정의서 model from a normalized schema. No I/O, no React. */
export function deriveTableDoc(schema: DbmlSchema): TableDocModel {
  // Per-table-id index of FK-holding local column names + the fkTargets to emit.
  const fkColumnsByTable = new Map<string, Set<string>>()
  const fkTargetsByTable = new Map<string, TableDocFkTarget[]>()

  for (const ref of schema.refs) {
    for (const { tableId, contribution } of fkContributions(ref)) {
      let cols = fkColumnsByTable.get(tableId)
      if (!cols) {
        cols = new Set<string>()
        fkColumnsByTable.set(tableId, cols)
      }
      for (const name of contribution.columns) cols.add(name)

      let targets = fkTargetsByTable.get(tableId)
      if (!targets) {
        targets = []
        fkTargetsByTable.set(tableId, targets)
      }
      targets.push(contribution.target)
    }
  }

  const tables: TableDocTable[] = schema.tables.map((t) => {
    const fkCols = fkColumnsByTable.get(t.id) ?? new Set<string>()
    const columns: TableDocColumn[] = t.columns.map((c) => ({
      name: c.name,
      type: c.type,
      pk: c.pk,
      fk: fkCols.has(c.name),
      notNull: c.notNull,
      unique: c.unique,
      default: c.default ?? '',
      note: c.note ?? '',
    }))
    return {
      id: t.id,
      schema: t.schema,
      name: t.name,
      note: t.note ?? '',
      columns,
      fkTargets: fkTargetsByTable.get(t.id) ?? [],
      checks: t.checks.map((c) => ({
        expression: c.expression,
        name: c.name ?? '',
        values: extractEnumCheckValues(c.expression),
      })),
    }
  })

  const enums: TableDocEnum[] = schema.enums.map((e) => ({
    id: `${e.schema}.${e.name}`,
    schema: e.schema,
    name: e.name,
    note: e.note ?? '',
    values: e.values.map((v) => ({ name: v.name, note: v.note ?? '' })),
  }))

  const groups = schema.tableGroups.map((g) => ({
    name: g.name,
    tableIds: [...g.tables],
  }))

  return { tables, enums, groups }
}
