/**
 * PURE sync-layout helper (ADR-0009). Given the project's CURRENT stored
 * positions and the freshly-introspected schema, produce the FINAL layout for a
 * DB sync: surviving tables keep their coords, removed tables are pruned, and
 * new tables are packed into the empty band BELOW the surviving bounding box via
 * a compact dagre sub-layout. Persisting these positions means reconcile
 * (ADR-0004) honors them instead of dropping new nodes onto overlapping dagre
 * coords. Keys are node ids = `${schema}.${name}` (LayoutPositions convention).
 *
 * entities layer: imports entities/erd (schemaToFlow + autoLayout + nodeSize) and
 * the entities/dbml + entities/layout TYPES (mirrors reconcile's entity deps).
 */
import type { DbmlSchema } from '@/entities/dbml'
import { schemaToFlow, autoLayout, nodeSize } from '@/entities/erd'
import type { LayoutPositions } from '@/entities/layout/model/types'

const PLACEMENT_GAP = 80

export function computeSyncedPositions(
  current: LayoutPositions,
  schema: DbmlSchema,
): LayoutPositions {
  const { nodes, edges } = schemaToFlow(schema)
  const tableNodes = nodes.filter((n) => n.type === 'table')

  const surviving = tableNodes.filter((n) => current[n.id] !== undefined)
  const fresh = tableNodes.filter((n) => current[n.id] === undefined)

  const result: LayoutPositions = {}
  for (const n of surviving) {
    result[n.id] = { x: current[n.id].x, y: current[n.id].y }
  }

  if (fresh.length === 0) return result
  if (surviving.length === 0) return {}

  let minX = Infinity
  let maxY = -Infinity
  for (const n of surviving) {
    const { x, y } = current[n.id]
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
