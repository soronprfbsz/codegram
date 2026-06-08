/**
 * PURE layout reconciliation (Plan 4, ADR-0004). Merges stored node positions
 * into freshly-parsed flow nodes BY NODE ID. Because schemaToFlow ids nodes by
 * name, reconciling by id IS reconciling by name: a rename changes the id, the
 * stored entry no longer matches, and the node is treated as new (-> dagre).
 *
 * Strategy: run autoLayout over the FULL graph ONCE (complete dagre baseline,
 * with group sizing + member re-basing all correct), then OVERRIDE the position
 * of every non-group node that has a frame-matching stored entry. Overriding a
 * grouped member can push it outside the dagre-computed group box, so a final
 * fitGroupBoxes pass re-sizes each group node to fit ALL its members. This is
 * simpler than laying out a partial graph (which breaks group sizing).
 *
 * entities layer: imports only entities/erd (autoLayout + TYPES) and the
 * entities/layout types. NO React, NO React Flow runtime (FSD downward imports).
 */
import { autoLayout } from '@/entities/erd'
import type { ErdFlowNode, ErdFlowEdge } from '@/entities/erd'
import { fitGroupBoxes } from './groupBox'
import type { LayoutPositions, StoredLayout } from '@/entities/layout/model/types'

/**
 * True when a stored entry's frame matches a flow node's frame: both ungrouped
 * (parentId undefined on both) OR grouped under the same parent. A mismatch
 * (table moved groups / became grouped / became ungrouped) means the stored
 * coords are in the wrong frame, so the node must fall back to dagre.
 */
function frameMatches(node: ErdFlowNode, stored: { parentId?: string }): boolean {
  return (node.parentId ?? undefined) === (stored.parentId ?? undefined)
}

/**
 * Merge stored positions into freshly-parsed flow nodes (ADR-0004, by node id).
 * PURE & deterministic. Reuses autoLayout for the unpositioned fallback.
 */
export function reconcileLayout(
  flowNodes: ErdFlowNode[],
  flowEdges: ErdFlowEdge[],
  stored: LayoutPositions,
): ErdFlowNode[] {
  if (flowNodes.length === 0) return []

  // 1. Full-graph dagre baseline (positions + initial group sizing). The group
  //    sizing here is only a starting point: step-3 overrides can move members,
  //    invalidating it, which is exactly why fitGroupBoxes re-fits afterward.
  const baseline = autoLayout(flowNodes, flowEdges)

  // 2. Override non-group nodes that have a frame-matching stored entry.
  const overridden = baseline.map((node) => {
    if (node.type === 'group') return node // group nodes are never positioned from stored data
    const entry = stored[node.id]
    if (!entry || !frameMatches(node, entry)) return node // unpositioned -> keep dagre baseline
    return { ...node, position: { x: entry.x, y: entry.y } }
  })

  // 3. Re-fit each group node to its (possibly moved) members.
  return fitGroupBoxes(overridden)
}

/**
 * Extract current node positions into the persisted shape. Excludes group
 * container nodes (their position/size are layout output, not persisted).
 * Records parentId for grouped members so reconcile can frame-guard on restore.
 */
export function nodesToLayout(nodes: ErdFlowNode[]): StoredLayout {
  const positions: LayoutPositions = {}
  for (const node of nodes) {
    if (node.type === 'group') continue
    positions[node.id] = {
      x: node.position.x,
      y: node.position.y,
      ...(node.parentId ? { parentId: node.parentId } : {}),
    }
  }
  return { version: 1, positions }
}
