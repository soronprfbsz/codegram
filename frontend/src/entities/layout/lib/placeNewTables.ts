/**
 * PURE sync-layout helper (ADR-0009). Given the project's CURRENT stored
 * positions and the freshly-MERGED schema (mergeDbml output), produce the FINAL
 * layout for a DB sync: surviving tables keep their stored entry VERBATIM —
 * including `parentId` and the group-relative coords of grouped members, so a
 * preserved table group keeps its exact arrangement instead of scrambling —
 * surviving group nodes keep their absolute coords, removed tables are pruned,
 * and new tables are packed into the empty band BELOW the surviving content via
 * a compact dagre sub-layout. The placement band is computed in ABSOLUTE space
 * (grouped member absolute = group origin + relative), so new tables land below
 * everything regardless of grouping. Persisting these positions means reconcile
 * (ADR-0004) honors them instead of dropping new nodes onto overlapping dagre
 * coords. Keys are node ids = `${schema}.${name}` (LayoutPositions convention).
 *
 * entities layer: imports entities/erd (schemaToFlow + autoLayout + nodeSize) and
 * the entities/dbml + entities/layout TYPES (mirrors reconcile's entity deps).
 */
import type { DbmlSchema } from '@/entities/dbml'
import { schemaToFlow, autoLayout, nodeSize } from '@/entities/erd'
import type { LayoutPositions, StoredPosition } from '@/entities/layout/model/types'

const PLACEMENT_GAP = 80

export function computeSyncedPositions(
  current: LayoutPositions,
  schema: DbmlSchema,
): LayoutPositions {
  const { nodes, edges } = schemaToFlow(schema)
  const tableNodes = nodes.filter((n) => n.type === 'table')
  const groupNodes = nodes.filter((n) => n.type === 'group')

  const surviving = tableNodes.filter((n) => current[n.id] !== undefined)
  const fresh = tableNodes.filter((n) => current[n.id] === undefined)

  // Preserve surviving tables' FULL stored entry (x, y, AND parentId): a grouped
  // member's coords are relative to its group, so reconcile's frame guard needs
  // the parentId to apply them under the (preserved) group instead of as absolute.
  const result: LayoutPositions = {}
  for (const n of surviving) {
    result[n.id] = { ...current[n.id] }
  }
  // Preserve surviving group nodes' stored absolute coords so the box stays put.
  for (const g of groupNodes) {
    if (current[g.id] !== undefined) result[g.id] = { ...current[g.id] }
  }

  if (fresh.length === 0) return result
  if (surviving.length === 0) return {}

  // Resolve a surviving table to ABSOLUTE coords (grouped member = group origin
  // + relative; ungrouped = stored coords as-is).
  const absOf = (entry: StoredPosition): { x: number; y: number } => {
    const parent = entry.parentId ? current[entry.parentId] : undefined
    return parent
      ? { x: parent.x + entry.x, y: parent.y + entry.y }
      : { x: entry.x, y: entry.y }
  }

  let minX = Infinity
  let maxY = -Infinity
  for (const n of surviving) {
    const { x, y } = absOf(current[n.id])
    const { height } = nodeSize(n)
    if (x < minX) minX = x
    if (y + height > maxY) maxY = y + height
  }

  const freshIds = new Set(fresh.map((n) => n.id))
  const freshEdges = edges.filter(
    (e) => freshIds.has(e.source) && freshIds.has(e.target),
  )
  const placed = autoLayout(fresh, freshEdges)

  let subMinX = Infinity
  let subMinY = Infinity
  for (const n of placed) {
    if (n.position.x < subMinX) subMinX = n.position.x
    if (n.position.y < subMinY) subMinY = n.position.y
  }

  const targetX = minX
  const targetY = maxY + PLACEMENT_GAP
  for (const n of placed) {
    result[n.id] = {
      x: n.position.x - subMinX + targetX,
      y: n.position.y - subMinY + targetY,
    }
  }

  return result
}
