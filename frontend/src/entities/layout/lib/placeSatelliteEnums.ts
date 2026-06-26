/**
 * PURE placement pass for CHECK-synthesized "satellite" enum nodes. Such an enum
 * belongs to exactly one table (EnumNodeData.ownerTableId) and is created live —
 * it has no stored position — so reconcile would otherwise leave it on a stale
 * dagre-baseline coord that overlaps the saved tables (and a value list can be
 * tall). This parks each satellite enum immediately to the RIGHT of its owner
 * table in ABSOLUTE space, nudging it DOWN until it clears EVERY table and enum
 * on the canvas (across groups). Satellites are TOP-LEVEL nodes, so growing a
 * group box can never swallow a neighbor. Satellites placed earlier in this pass
 * are accounted for so multiple of them stack instead of colliding.
 *
 * Only enums WITHOUT a stored position are parked — so a user-dragged enum (its
 * position persisted) is respected on reload, and Auto-arrange (which reconciles
 * against an EMPTY stored set) re-parks every enum satellite-style. A brand-new
 * enum (never positioned) is parked on first appearance.
 *
 * entities layer: imports only entities/erd TYPES + the shared nodeSize geometry.
 */
import type { ErdFlowNode, EnumNodeData } from '@/entities/erd'
import { nodeSize } from '@/entities/erd'
import type { LayoutPositions } from '@/entities/layout/model/types'

const GAP = 40
const STEP = 24

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

function ownerTableId(node: ErdFlowNode): string | undefined {
  if (node.type !== 'enum') return undefined
  const id = (node.data as EnumNodeData).ownerTableId
  return typeof id === 'string' ? id : undefined
}

export function placeSatelliteEnums(
  nodes: ErdFlowNode[],
  stored: LayoutPositions,
): ErdFlowNode[] {
  const fresh = nodes.filter(
    (n) => ownerTableId(n) !== undefined && stored[n.id] === undefined,
  )
  if (fresh.length === 0) return nodes

  const freshIds = new Set(fresh.map((n) => n.id))
  const byId = new Map(nodes.map((n) => [n.id, n]))

  // Absolute rect of a node (a grouped member's coords are relative to its group).
  const absRect = (n: ErdFlowNode): Rect => {
    const { width, height } = nodeSize(n)
    const parent = n.parentId ? byId.get(n.parentId) : undefined
    const ox = parent ? parent.position.x : 0
    const oy = parent ? parent.position.y : 0
    return { x: ox + n.position.x, y: oy + n.position.y, width, height }
  }

  // Every table/enum's absolute rect (except the satellites we are placing) is
  // an obstacle. Group boxes are translucent backdrops, not collision targets.
  const occupied: Rect[] = nodes
    .filter((n) => (n.type === 'table' || n.type === 'enum') && !freshIds.has(n.id))
    .map(absRect)

  const moved = new Map<string, { x: number; y: number }>()
  for (const en of fresh) {
    const owner = byId.get(ownerTableId(en)!)
    if (!owner) continue // owner missing (shouldn't happen) — leave as-is
    const ownerRect = absRect(owner)
    const size = nodeSize(en)
    const x = ownerRect.x + ownerRect.width + GAP
    let y = ownerRect.y
    let guard = 0
    while (
      guard++ < 5000 &&
      occupied.some((r) => overlaps(r, { x, y, width: size.width, height: size.height }))
    ) {
      y += STEP
    }
    // Satellite is top-level, so its position IS absolute.
    moved.set(en.id, { x, y })
    occupied.push({ x, y, width: size.width, height: size.height })
  }

  return nodes.map((n) =>
    moved.has(n.id) ? { ...n, position: moved.get(n.id)! } : n,
  )
}
