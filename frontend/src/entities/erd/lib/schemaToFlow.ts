/**
 * PURE adapter (Plan 3b, D2): DbmlSchema -> { nodes, edges } in React Flow
 * shapes. NO hooks, NO side effects, NO React Flow runtime — only the Node/Edge
 * TYPES (via entities/erd/model/types). Node ids are the normalized keys
 * (DbmlTable.id, `enum:${schema}.${name}`, `note:${name}`, `group:${name}`) so
 * Plan 4 Layout can reconcile by name (ADR-0004). Positions are NOT computed
 * here — autoLayout (separate pure unit) assigns them.
 *
 * entities layer: imports only entities/dbml + entities/erd types (FSD).
 */
import type {
  DbmlSchema,
  DbmlTable,
  DbmlRef,
  DbmlRelation,
} from '@/entities/dbml'
import type {
  ErdFlow,
  ErdFlowNode,
  ErdFlowEdge,
  ErdColumn,
  TableNodeData,
  EnumNodeData,
  StickyNodeData,
  GroupNodeData,
  RelationEndpointMarker,
  RelationEdgeData,
} from '@/entities/erd/model/types'

const ZERO = { x: 0, y: 0 }

/** Stable node id for an enum (distinct namespace from table ids). */
function enumNodeId(schema: string, name: string): string {
  return `enum:${schema}.${name}`
}

/** Stable node id for a standalone note. */
function noteNodeId(name: string): string {
  return `note:${name}`
}

/** Stable node id for a table group. */
function groupNodeId(name: string): string {
  return `group:${name}`
}

/** Map one side of a DbmlRelation to its crow-foot marker. '1' -> one, 'n' -> many. */
function sideMarker(side: '1' | 'n'): RelationEndpointMarker {
  return side === 'n' ? 'many' : 'one'
}

/** Split `${from}-${to}` into per-endpoint markers (NOT assuming from=many). */
function relationMarkers(relation: DbmlRelation): {
  source: RelationEndpointMarker
  target: RelationEndpointMarker
} {
  const [from, to] = relation.split('-') as ['1' | 'n', '1' | 'n']
  return { source: sideMarker(from), target: sideMarker(to) }
}

/** Build the ErdColumn rows (handle ids == DbmlColumn.id) for a table node. */
function toErdColumns(table: DbmlTable): ErdColumn[] {
  return table.columns.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    pk: c.pk,
    fk: c.isFk,
    nn: c.notNull,
    unique: c.unique,
  }))
}

/** Reconstruct a column's handle id from a ref endpoint (`${schema}.${table}.${column}`). */
function columnHandleId(schema: string, table: string, column: string): string {
  return `${schema}.${table}.${column}`
}

/** One relationship edge per column pair (composite FK -> one edge per pair). */
function refToEdges(ref: DbmlRef): ErdFlowEdge[] {
  const { source, target } = relationMarkers(ref.relation)
  const sourceNode = `${ref.fromSchema}.${ref.fromTable}`
  const targetNode = `${ref.toSchema}.${ref.toTable}`
  const pairCount = Math.min(ref.fromColumns.length, ref.toColumns.length)
  const edges: ErdFlowEdge[] = []
  for (let i = 0; i < pairCount; i++) {
    const fromCol = ref.fromColumns[i]
    const toCol = ref.toColumns[i]
    const data: RelationEdgeData = {
      relation: ref.relation,
      sourceMarker: source,
      targetMarker: target,
    }
    edges.push({
      id: `${ref.id}#${i}`,
      type: 'relation',
      source: sourceNode,
      target: targetNode,
      sourceHandle: columnHandleId(ref.fromSchema, ref.fromTable, fromCol),
      targetHandle: columnHandleId(ref.toSchema, ref.toTable, toCol),
      data,
    })
  }
  return edges
}

/**
 * Build dashed column->enum link edges: a column whose `type` equals an enum's
 * name (same schema) gets one dashed edge from its handle to the enum node.
 * (D5 choice: included — cheap single pass.)
 */
function enumLinkEdges(schema: DbmlSchema): ErdFlowEdge[] {
  const enumKey = new Set(schema.enums.map((e) => `${e.schema}.${e.name}`))
  const edges: ErdFlowEdge[] = []
  for (const table of schema.tables) {
    for (const col of table.columns) {
      const key = `${table.schema}.${col.type}`
      if (enumKey.has(key)) {
        const data: RelationEdgeData = {
          relation: 'n-1',
          sourceMarker: 'many',
          targetMarker: 'one',
          isEnumLink: true,
        }
        edges.push({
          id: `enumlink:${col.id}`,
          type: 'relation',
          source: table.id,
          sourceHandle: col.id,
          target: enumNodeId(table.schema, col.type),
          data,
        })
      }
    }
  }
  return edges
}

/**
 * Convert a normalized DbmlSchema into React Flow nodes + edges. Group nodes are
 * emitted BEFORE their member tables so React Flow can establish the parent/child
 * hierarchy; grouped member tables receive parentId == the group node id.
 */
export function schemaToFlow(schema: DbmlSchema): ErdFlow {
  // Map each grouped table id -> its group node id (members get parentId).
  const parentOf = new Map<string, string>()
  for (const group of schema.tableGroups) {
    for (const tableId of group.tables) {
      parentOf.set(tableId, groupNodeId(group.name))
    }
  }

  const groupNodes: ErdFlowNode[] = schema.tableGroups.map((group) => {
    const data: GroupNodeData = { groupName: group.name, color: group.color }
    return {
      id: groupNodeId(group.name),
      type: 'group',
      position: { ...ZERO },
      data,
    }
  })

  const tableNodes: ErdFlowNode[] = schema.tables.map((table) => {
    const data: TableNodeData = {
      tableName: table.name,
      tableId: table.id,
      headerColor: table.headerColor,
      columns: toErdColumns(table),
    }
    const node: ErdFlowNode = {
      id: table.id,
      type: 'table',
      position: { ...ZERO },
      data,
    }
    const parentId = parentOf.get(table.id)
    if (parentId) {
      node.parentId = parentId
    }
    return node
  })

  const enumNodes: ErdFlowNode[] = schema.enums.map((e) => {
    const data: EnumNodeData = {
      enumName: e.name,
      values: e.values.map((v) => v.name),
    }
    return {
      id: enumNodeId(e.schema, e.name),
      type: 'enum',
      position: { ...ZERO },
      data,
    }
  })

  const stickyNodes: ErdFlowNode[] = schema.notes.map((note) => {
    const data: StickyNodeData = {
      title: note.name,
      content: note.content,
      headerColor: note.headerColor,
    }
    return {
      id: noteNodeId(note.name),
      type: 'sticky',
      position: { ...ZERO },
      data,
    }
  })

  // Group nodes FIRST (React Flow parent-before-child requirement), then tables,
  // then enums + sticky notes.
  const nodes: ErdFlowNode[] = [
    ...groupNodes,
    ...tableNodes,
    ...enumNodes,
    ...stickyNodes,
  ]

  const edges: ErdFlowEdge[] = [
    ...schema.refs.flatMap(refToEdges),
    ...enumLinkEdges(schema),
  ]

  return { nodes, edges }
}
