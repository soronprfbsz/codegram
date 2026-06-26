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
import { parseEnumCheck } from '@/entities/dbml'
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
import { deriveDisplayGroups } from './tableGroups'

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

/**
 * Split `${from}-${to}` into per-endpoint markers (NOT assuming from=many). The
 * split is total over the four DbmlRelation values; the `as` cast assumes a
 * well-typed DbmlRelation input.
 */
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
          targetHandle: 'in',
          data,
        })
      }
    }
  }
  return edges
}

/**
 * Synthesize enum nodes (+ dashed column links) from enum-style CHECK
 * constraints — a TEXT column constrained to a value set (`col = ANY(ARRAY[…])`
 * / `col IN (…)`) is semantically an enum, so it renders like a native enum on
 * the canvas. Reserves each synthesized node id in `used` so the edge-validity
 * filter (which checks emitted node ids) keeps the links. The constrained
 * column must exist on the table; otherwise the check is skipped.
 *
 * These are TOP-LEVEL nodes (not group members): `EnumNodeData.ownerTableId`
 * records the owning table so the layout parks the enum BESIDE that table (a
 * value list can be tall, and forcing it inside a packed group's box would make
 * the box swallow neighboring tables — see placeSatelliteEnums).
 */
function checkEnumNodesAndEdges(
  schema: DbmlSchema,
  used: Set<string>,
): { nodes: ErdFlowNode[]; edges: ErdFlowEdge[] } {
  const nodes: ErdFlowNode[] = []
  const edges: ErdFlowEdge[] = []
  for (const table of schema.tables) {
    const checks = Array.isArray(table.checks) ? table.checks : []
    for (const check of checks) {
      const { column, values } = parseEnumCheck(check.expression)
      if (!column || values.length === 0) continue
      if (!table.columns.some((c) => c.name === column)) continue
      const id = reserveId(used, `enum:check:${table.id}.${column}`)
      const data: EnumNodeData = { enumName: column, values, ownerTableId: table.id }
      nodes.push({ id, type: 'enum', position: { ...ZERO }, data })
      const colId = `${table.schema}.${table.name}.${column}`
      const edgeData: RelationEdgeData = {
        relation: 'n-1',
        sourceMarker: 'many',
        targetMarker: 'one',
        isEnumLink: true,
      }
      edges.push({
        id: `enumlink:check:${colId}`,
        type: 'relation',
        source: table.id,
        sourceHandle: colId,
        target: id,
        targetHandle: 'in',
        data: edgeData,
      })
    }
  }
  return { nodes, edges }
}

/**
 * Reserve a node id, suffixing (`#2`, `#3`, …) on collision so duplicate names
 * (two notes "TODO", two same-name groups/enums) never emit colliding ids — a
 * React Flow nodeLookup key collision. `used` is mutated in place; the function
 * itself is a small local utility within the pure schemaToFlow call.
 */
function reserveId(used: Set<string>, base: string): string {
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  let n = 2
  while (used.has(`${base}#${n}`)) n++
  const id = `${base}#${n}`
  used.add(id)
  return id
}

/**
 * Convert a normalized DbmlSchema into React Flow nodes + edges. Group nodes are
 * emitted BEFORE their member tables so React Flow can establish the parent/child
 * hierarchy; grouped member tables receive parentId == the group node id.
 */
export function schemaToFlow(schema: DbmlSchema): ErdFlow {
  // Track every emitted node id so duplicate names get a unique suffix and so
  // edges can be validated against existing endpoints below.
  const usedNodeIds = new Set<string>()

  // Derive group display info (color) from the schema.
  const displayGroups = deriveDisplayGroups(schema)

  // Map each grouped table id -> its group node id (members get parentId).
  const parentOf = new Map<string, string>()

  const groupNodes: ErdFlowNode[] = schema.tableGroups.map((group, index) => {
    const id = reserveId(usedNodeIds, groupNodeId(group.name))
    for (const tableId of group.tables) {
      parentOf.set(tableId, id)
    }
    // Use same color resolution as deriveDisplayGroups for consistency.
    const dg = displayGroups[index]
    const data: GroupNodeData = {
      groupName: group.name,
      color: dg?.color ?? group.color,
    }
    return {
      id,
      type: 'group',
      position: { ...ZERO },
      dragHandle: '.erd-group-handle',
      selectable: false,
      data,
    }
  })

  const tableNodes: ErdFlowNode[] = schema.tables.map((table) => {
    const id = reserveId(usedNodeIds, table.id)
    const data: TableNodeData = {
      tableName: table.name,
      tableId: table.id,
      headerColor: table.headerColor,
      columns: toErdColumns(table),
    }
    const node: ErdFlowNode = {
      id,
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
    const id = reserveId(usedNodeIds, enumNodeId(e.schema, e.name))
    const data: EnumNodeData = {
      enumName: e.name,
      values: e.values.map((v) => v.name),
    }
    return {
      id,
      type: 'enum',
      position: { ...ZERO },
      data,
    }
  })

  const stickyNodes: ErdFlowNode[] = schema.notes.map((note) => {
    const id = reserveId(usedNodeIds, noteNodeId(note.name))
    const data: StickyNodeData = {
      title: note.name,
      content: note.content,
      headerColor: note.headerColor,
    }
    return {
      id,
      type: 'sticky',
      position: { ...ZERO },
      data,
    }
  })

  // Enum nodes synthesized from enum-style CHECK constraints (+ their column
  // links). Built after the real nodes so every table id is already reserved.
  const checkEnums = checkEnumNodesAndEdges(schema, usedNodeIds)

  // Group nodes FIRST (React Flow parent-before-child requirement), then tables,
  // then enums (native + check-derived) + sticky notes.
  const nodes: ErdFlowNode[] = [
    ...groupNodes,
    ...tableNodes,
    ...enumNodes,
    ...checkEnums.nodes,
    ...stickyNodes,
  ]

  // De-duplicate edges that describe the SAME column pair. A DB often defines a
  // relationship both as a single-column FK and inside a composite FK (e.g.
  // `users.tenant_id > tenants.id` AND `tenants.(id,org_id) < users.(tenant_id,
  // org_id)`), which would otherwise draw the id→tenant_id line twice, exactly
  // overlapping. Key by the fully-qualified handle pair; keep the first.
  const seenPair = new Set<string>()
  const dedupe = (e: ErdFlowEdge): boolean => {
    const key = `${e.source}|${e.sourceHandle ?? ''}>${e.target}|${e.targetHandle ?? ''}`
    if (seenPair.has(key)) return false
    seenPair.add(key)
    return true
  }

  // Drop edges to endpoints that aren't emitted nodes (dangling refs to missing
  // tables/columns) — React Flow silently drops such edges; emit only valid ones.
  const edges: ErdFlowEdge[] = [
    ...schema.refs.flatMap(refToEdges),
    ...enumLinkEdges(schema),
    ...checkEnums.edges,
  ]
    .filter(dedupe)
    .filter((e) => usedNodeIds.has(e.source) && usedNodeIds.has(e.target))

  return { nodes, edges }
}
