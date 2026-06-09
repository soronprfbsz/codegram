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
import { nodeSize, GROUP_PADDING, GROUP_LABEL_BAND } from './nodeSize'

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

  // Second pass: size each group node to the bounding box of its members and
  // record each group's final (absolute) top-left so children can be re-based.
  const groupPos = new Map<string, { x: number; y: number }>()
  const sized = positioned.map((node) => {
    if (!groupIds.has(node.id)) return node
    const laid = g.node(node.id)
    if (laid && typeof laid.width === 'number' && typeof laid.height === 'number') {
      // The TOP inset reserves GROUP_PADDING + GROUP_LABEL_BAND so members sit
      // BELOW the label band; the other three sides use GROUP_PADDING. The box
      // is therefore always strictly larger than its members.
      const position = {
        x: laid.x - laid.width / 2 - GROUP_PADDING,
        y: laid.y - laid.height / 2 - GROUP_PADDING - GROUP_LABEL_BAND,
      }
      groupPos.set(node.id, position)
      return {
        ...node,
        position,
        style: {
          ...node.style,
          width: laid.width + GROUP_PADDING * 2,
          height: laid.height + GROUP_PADDING * 2 + GROUP_LABEL_BAND,
        },
      }
    }
    groupPos.set(node.id, { x: 0, y: 0 })
    return { ...node, style: { ...node.style, width: 1, height: 1 } }
  })

  // Third pass: re-base grouped member nodes so their `position` is RELATIVE to
  // the parent group (React Flow computes a child's absolute position as
  // parentAbsolute + child.position; the first pass gave absolute coords).
  const finalNodes = sized.map((node) => {
    if (groupIds.has(node.id)) return node
    const parent = node.parentId ? groupPos.get(node.parentId) : undefined
    if (!parent) return node
    return {
      ...node,
      position: {
        x: node.position.x - parent.x,
        y: node.position.y - parent.y,
      },
    }
  })

  return finalNodes
}
