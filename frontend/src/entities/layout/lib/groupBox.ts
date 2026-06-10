/**
 * PURE group-box refit (Plan 4). After reconcile overrides member positions, a
 * grouped member can fall outside the dagre-computed group box. For every group
 * node this recomputes its position + style.width/height to fit ALL its members
 * in ABSOLUTE space, then re-bases members so their `position` is relative to the
 * NEW group origin (React Flow: child absolute = parentAbsolute + child.position).
 *
 * Uses the SAME node-size estimates + GROUP_PADDING as entities/erd autoLayout
 * (imported from the shared @/entities/erd nodeSize source of truth) so the
 * colored group region and member coords never diverge. Group nodes with no
 * members and all ungrouped nodes pass through unchanged.
 *
 * entities layer: imports only entities/erd TYPES + the pure nodeSize geometry.
 * NO React Flow runtime.
 */
import type { ErdFlowNode } from '@/entities/erd'
import {
  nodeSize,
  GROUP_PAD_X,
  GROUP_PAD_TOP,
  GROUP_PAD_BOTTOM,
} from '@/entities/erd'

/**
 * Re-fit each group node to cover all its members and re-base members to the new
 * group origin. PURE: returns NEW nodes; input is not mutated.
 */
export function fitGroupBoxes(nodes: ErdFlowNode[]): ErdFlowNode[] {
  const groups = nodes.filter((n) => n.type === 'group')
  if (groups.length === 0) return nodes

  // Build, for each group, the absolute bbox of its members (member absolute =
  // group OLD absolute + member relative). Then the new group origin = bbox
  // top-left minus padding; new size = bbox extent + 2*padding.
  const newOrigin = new Map<string, { x: number; y: number }>()
  const newSize = new Map<string, { width: number; height: number }>()

  for (const group of groups) {
    const members = nodes.filter((n) => n.parentId === group.id)
    if (members.length === 0) continue

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const m of members) {
      const { width, height } = nodeSize(m)
      const absX = group.position.x + m.position.x
      const absY = group.position.y + m.position.y
      minX = Math.min(minX, absX)
      minY = Math.min(minY, absY)
      maxX = Math.max(maxX, absX + width)
      maxY = Math.max(maxY, absY + height)
    }
    // Directional insets (matches autoLayout): roomy X gutters, a TOP label
    // band, and a BOTTOM that matches TOP. Always strictly larger than members.
    newOrigin.set(group.id, {
      x: minX - GROUP_PAD_X,
      y: minY - GROUP_PAD_TOP,
    })
    newSize.set(group.id, {
      width: maxX - minX + GROUP_PAD_X * 2,
      height: maxY - minY + GROUP_PAD_TOP + GROUP_PAD_BOTTOM,
    })
  }

  // The refit below is UNCONDITIONAL: every group with members is re-sized and
  // every member re-based to the new origin, even when `stored` was empty and the
  // positions came straight from autoLayout. That is intentional and
  // idempotent-in-shape — autoLayout already fits the box, so recomputing the
  // same bbox + padding yields the same extent; it is not a no-op to skip.
  return nodes.map((node) => {
    if (node.type === 'group') {
      const origin = newOrigin.get(node.id)
      const size = newSize.get(node.id)
      if (!origin || !size) return node // no members -> untouched
      return {
        ...node,
        position: origin,
        style: { ...node.style, width: size.width, height: size.height },
      }
    }
    // Re-base a grouped member relative to its group's NEW origin.
    if (node.parentId) {
      const oldGroup = groups.find((g) => g.id === node.parentId)
      const origin = newOrigin.get(node.parentId)
      if (oldGroup && origin) {
        const absX = oldGroup.position.x + node.position.x
        const absY = oldGroup.position.y + node.position.y
        return { ...node, position: { x: absX - origin.x, y: absY - origin.y } }
      }
    }
    return node
  })
}
