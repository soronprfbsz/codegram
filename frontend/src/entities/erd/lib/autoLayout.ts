/**
 * PURE layout entry-point (Plan 3b, D8). Given the adapter's nodes + edges it
 * computes a position for every node (top-left, React Flow convention) and a
 * bounding-box style for each group node so it renders as a colored region
 * behind its members. Deterministic for a given input. NO persistence — the
 * canvas re-runs this every parse. NO React Flow runtime is imported (types only).
 *
 * entities layer: delegates to gridLayout / packGroupedLayout (no direct dagre import). FSD downward imports.
 *
 * - No groups → balanced grid packing (ADR-0010).
 * - Groups present → per-group grid packing + dagre meta-graph (packGroupedLayout).
 */
import type { ErdFlowNode, ErdFlowEdge } from '@/entities/erd/model/types'
import { gridLayout } from './gridLayout'
import { packGroupedLayout } from './groupedLayout'

export function autoLayout(
  nodes: ErdFlowNode[],
  edges: ErdFlowEdge[],
): ErdFlowNode[] {
  if (nodes.length === 0) return []

  if (!nodes.some((n) => n.type === 'group')) {
    return gridLayout(nodes, edges)
  }

  return packGroupedLayout(nodes, edges)
}
