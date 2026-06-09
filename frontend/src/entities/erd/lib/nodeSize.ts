/**
 * Shared node-size geometry (Plan 4 refactor). The single source of truth for the
 * conservative rendered-size estimates and group padding used by BOTH the dagre
 * auto-layout (entities/erd/lib/autoLayout) and the post-drag group-box refit
 * (entities/layout/lib/groupBox). Keeping ONE copy guarantees the colored group
 * region and the refit region compute identical extents for identical members.
 *
 * entities layer: imports only entities/erd types. PURE, no side effects (FSD).
 */
import type { ErdFlowNode } from '@/entities/erd/model/types'

/** Conservative node-size estimates fed to dagre (dagre needs dims up front). */
export const TABLE_WIDTH = 240
export const HEADER_HEIGHT = 40
export const ROW_HEIGHT = 26
export const ENUM_WIDTH = 200
export const STICKY_WIDTH = 220
export const STICKY_HEIGHT = 120
export const GROUP_PADDING = 24
/**
 * Extra space reserved at the TOP of a group box, ABOVE the member padding, so
 * the group's label band is always visible and never overlapped by the topmost
 * member (README §Group backdrops: "extra top band for the label"). Group boxes
 * therefore extend `GROUP_PADDING + GROUP_LABEL_BAND` above their members and
 * `GROUP_PADDING` on the other three sides — always strictly larger than the
 * members they contain.
 */
export const GROUP_LABEL_BAND = 34

/** Estimate a node's rendered size so layout works without DOM measurement. */
export function nodeSize(node: ErdFlowNode): { width: number; height: number } {
  if (node.type === 'table') {
    const cols = Array.isArray(
      (node.data as { columns?: unknown[] }).columns,
    )
      ? (node.data as { columns: unknown[] }).columns.length
      : 0
    return { width: TABLE_WIDTH, height: HEADER_HEIGHT + cols * ROW_HEIGHT }
  }
  if (node.type === 'enum') {
    const vals = Array.isArray((node.data as { values?: unknown[] }).values)
      ? (node.data as { values: unknown[] }).values.length
      : 0
    return { width: ENUM_WIDTH, height: HEADER_HEIGHT + vals * ROW_HEIGHT }
  }
  // sticky + group fall back to fixed boxes (group is re-sized post-layout).
  return { width: STICKY_WIDTH, height: STICKY_HEIGHT }
}
