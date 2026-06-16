/**
 * PURE balanced-grid layout (ADR-0010). Packs all nodes into a grid whose
 * overall rectangle targets a 16:10 aspect, so a sparse schema (few FKs) no
 * longer collapses into one tall column the way dagre 'LR' does. Columns are
 * uniform width (left-aligned); rows are top-aligned (row height = tallest
 * member). Nodes are ordered by FK connectivity (BFS over relation edges, enum
 * links excluded) so connected tables land in adjacent cells — short edges that
 * route through the gutters (best-effort no overlap). Deterministic.
 *
 * entities layer: imports only entities/erd types + the pure nodeSize geometry.
 */
import type { ErdFlowNode, ErdFlowEdge } from '@/entities/erd/model/types'
import { nodeSize } from './nodeSize'

// 테이블 사이 코리도(공장라인 2단계) 폭. 평행선 여러 개가 카드를 스치지 않고
// 지나갈 만큼 넉넉하게(고정). 그룹 미사용 다이어그램의 전체 배치와
// packGroupedLayout의 그룹 내부 패킹 양쪽에 쓰인다.
const GAP_X = 120
const GAP_Y = 100
const TARGET_ASPECT = 1.6 // 16:10 (width:height)

export function gridLayout(
  nodes: ErdFlowNode[],
  edges: ErdFlowEdge[],
): ErdFlowNode[] {
  if (nodes.length === 0) return []

  // 1. Undirected adjacency from relation edges (skip enum-link + dangling).
  const ids = new Set(nodes.map((n) => n.id))
  const adj = new Map<string, string[]>()
  const link = (a: string, b: string) => {
    const list = adj.get(a)
    if (list) list.push(b)
    else adj.set(a, [b])
  }
  for (const e of edges) {
    if ((e.data as { isEnumLink?: boolean } | undefined)?.isEnumLink) continue
    if (!ids.has(e.source) || !ids.has(e.target)) continue
    link(e.source, e.target)
    link(e.target, e.source)
  }

  // 2. Connectivity ordering: BFS components in input order → connected nodes
  //    are contiguous in the 1D order.
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const visited = new Set<string>()
  const order: ErdFlowNode[] = []
  for (const start of nodes) {
    if (visited.has(start.id)) continue
    visited.add(start.id)
    const queue = [start.id]
    while (queue.length) {
      const id = queue.shift() as string
      order.push(byId.get(id) as ErdFlowNode)
      for (const nb of adj.get(id) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb)
          queue.push(nb)
        }
      }
    }
  }

  // 3. Cell metrics + column count for the target aspect.
  const sizes = order.map((n) => nodeSize(n))
  const cellW = Math.max(...sizes.map((s) => s.width))
  const avgH = sizes.reduce((a, s) => a + s.height, 0) / order.length
  const N = order.length
  const cols = Math.min(
    N,
    Math.max(
      1,
      Math.round(
        Math.sqrt(((N * (avgH + GAP_Y)) / (cellW + GAP_X)) * TARGET_ASPECT),
      ),
    ),
  )

  // 4. Top-aligned row tops (row height = tallest cell in the row).
  const rows = Math.ceil(N / cols)
  const rowH = new Array(rows).fill(0)
  order.forEach((_, i) => {
    const r = Math.floor(i / cols)
    rowH[r] = Math.max(rowH[r], sizes[i].height)
  })
  const rowTop = new Array(rows).fill(0)
  for (let r = 1; r < rows; r++) rowTop[r] = rowTop[r - 1] + rowH[r - 1] + GAP_Y

  // 5. Position each node: left-aligned column x, top-aligned row y.
  return order.map((node, i) => {
    const r = Math.floor(i / cols)
    const c = i % cols
    return { ...node, position: { x: c * (cellW + GAP_X), y: rowTop[r] } }
  })
}
