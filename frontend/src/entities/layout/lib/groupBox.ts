/**
 * PURE group-box refit (Plan 4). After reconcile overrides member positions, a
 * grouped member can fall outside the dagre-computed group box; this recomputes
 * each group node's position + style.width/height to fit ALL its members, then
 * re-bases members relative to the new group origin.
 *
 * entities layer: imports only entities/erd TYPES. NO React Flow runtime.
 */
import type { ErdFlowNode } from '@/entities/erd'

// Placeholder identity pass; real implementation in Task 5.
export function fitGroupBoxes(nodes: ErdFlowNode[]): ErdFlowNode[] {
  return nodes
}
