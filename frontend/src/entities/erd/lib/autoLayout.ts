/**
 * PURE dagre layered layout (Plan 3b, D8). Given the adapter's nodes + edges it
 * computes a position for every node (top-left, React Flow convention) and a
 * bounding-box style for each group node so it renders as a colored region
 * behind its members. Group members are kept clustered via dagre compound
 * subgraphs (setParent). Deterministic for a given input. NO persistence — the
 * canvas re-runs this every parse. NO React Flow runtime is imported (types only).
 *
 * entities layer: imports only @dagrejs/dagre + entities/erd types (FSD).
 */
import dagre from '@dagrejs/dagre'
import type { ErdFlowNode, ErdFlowEdge } from '@/entities/erd/model/types'

/** Conservative node-size estimates fed to dagre (dagre needs dims up front). */
const TABLE_WIDTH = 240
const HEADER_HEIGHT = 40
const ROW_HEIGHT = 26
const ENUM_WIDTH = 200
const STICKY_WIDTH = 220
const STICKY_HEIGHT = 120
const GROUP_PADDING = 24

/** Estimate a node's rendered size so dagre lays out without DOM measurement. */
function nodeSize(node: ErdFlowNode): { width: number; height: number } {
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

/**
 * Lay out nodes with dagre and return NEW nodes carrying computed positions.
 * Group nodes are excluded from dagre's own node set (they are containers) but
 * declared as compound parents via setParent so dagre clusters their members;
 * after layout each group node is sized to the bounding box of its members.
 * Enum-link (dashed) edges are excluded from the layout graph so they do not
 * distort the table ranking.
 */
export function autoLayout(
  nodes: ErdFlowNode[],
  edges: ErdFlowEdge[],
): ErdFlowNode[] {
  if (nodes.length === 0) return []

  const g = new dagre.graphlib.Graph({ compound: true })
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 160, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))

  const groupIds = new Set(
    nodes.filter((n) => n.type === 'group').map((n) => n.id),
  )

  // Register non-group nodes with their estimated sizes; declare group parents.
  for (const node of nodes) {
    if (groupIds.has(node.id)) {
      // Compound parent placeholder; dagre will compute its cluster extent.
      g.setNode(node.id, {})
      continue
    }
    const { width, height } = nodeSize(node)
    g.setNode(node.id, { width, height })
    if (node.parentId && groupIds.has(node.parentId)) {
      g.setParent(node.id, node.parentId)
    }
  }

  // Only relationship edges between laid-out nodes drive ranking; skip dashed
  // enum links and any edge whose endpoints aren't graph nodes.
  for (const edge of edges) {
    if ((edge.data as { isEnumLink?: boolean } | undefined)?.isEnumLink) continue
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target)
    }
  }

  dagre.layout(g)

  // First pass: position every non-group node (dagre anchors at center).
  const positioned: ErdFlowNode[] = nodes.map((node) => {
    if (groupIds.has(node.id)) return node // group sized in second pass
    const laid = g.node(node.id)
    const { width, height } = nodeSize(node)
    return {
      ...node,
      position: {
        x: (laid?.x ?? 0) - width / 2,
        y: (laid?.y ?? 0) - height / 2,
      },
    }
  })

  // Second pass: size each group node to the bounding box of its members.
  const finalNodes = positioned.map((node) => {
    if (!groupIds.has(node.id)) return node
    const laid = g.node(node.id)
    if (laid && typeof laid.width === 'number' && typeof laid.height === 'number') {
      return {
        ...node,
        position: {
          x: laid.x - laid.width / 2 - GROUP_PADDING,
          y: laid.y - laid.height / 2 - GROUP_PADDING,
        },
        style: {
          ...node.style,
          width: laid.width + GROUP_PADDING * 2,
          height: laid.height + GROUP_PADDING * 2,
        },
      }
    }
    return { ...node, style: { ...node.style, width: 1, height: 1 } }
  })

  return finalNodes
}
