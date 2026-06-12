// frontend/src/entities/erd/lib/groupedLayout.ts
/**
 * PURE 그룹 레이아웃 (ADR-0010, 2026-06-12 개정). 각 그룹의 멤버를 그룹 박스
 * 안에서 gridLayout으로 콤팩트 패킹하고, 그룹 블록·미분류 엔티티를 dagre 메타
 * 그래프(블록=슈퍼노드, 그룹 간 관계로 연결)로 배치한다. dagre-compound가
 * 멤버를 펼쳐 그룹 박스가 세로로 길고 비던 문제를 없앤다.
 *
 * entities layer: @dagrejs/dagre + entities/erd types/geometry만 의존. 순수.
 */
import dagre from '@dagrejs/dagre'
import type { ErdFlowNode, ErdFlowEdge } from '@/entities/erd/model/types'
import { nodeSize, GROUP_PAD_X, GROUP_PAD_TOP, GROUP_PAD_BOTTOM } from './nodeSize'
import { gridLayout } from './gridLayout'
import { separateGroups } from './separateGroups'

/** 한 그룹 멤버를 그리드 패킹하고 박스/멤버상대좌표를 계산. */
function packGroup(members: ErdFlowNode[]): {
  packed: ErdFlowNode[] // position = 그룹 원점 기준 상대좌표
  width: number
  height: number
} {
  // gridLayout은 (0,0)부터 절대 배치 → 그것을 콘텐츠 좌표로 사용.
  const laid = gridLayout(members, [])
  let maxX = 0
  let maxY = 0
  for (const m of laid) {
    const { width, height } = nodeSize(m)
    maxX = Math.max(maxX, m.position.x + width)
    maxY = Math.max(maxY, m.position.y + height)
  }
  const packed = laid.map((m) => ({
    ...m,
    position: { x: m.position.x + GROUP_PAD_X, y: m.position.y + GROUP_PAD_TOP },
  }))
  return {
    packed,
    width: maxX + GROUP_PAD_X * 2,
    height: maxY + GROUP_PAD_TOP + GROUP_PAD_BOTTOM,
  }
}

export function packGroupedLayout(
  nodes: ErdFlowNode[],
  edges: ErdFlowEdge[],
): ErdFlowNode[] {
  if (nodes.length === 0) return []

  const groupIds = new Set(nodes.filter((n) => n.type === 'group').map((n) => n.id))
  // node id -> 소속 그룹 id (그룹 멤버만).
  const groupOf = new Map<string, string>()
  for (const n of nodes) {
    if (n.parentId && groupIds.has(n.parentId)) groupOf.set(n.id, n.parentId)
  }

  // 1) 각 그룹 내부 패킹.
  const packedByGroup = new Map<string, ReturnType<typeof packGroup>>()
  for (const gid of groupIds) {
    const members = nodes.filter((n) => n.parentId === gid)
    if (members.length === 0) continue
    packedByGroup.set(gid, packGroup(members))
  }

  // 2) 메타 그래프: 슈퍼노드 = 그룹(블록 크기) + 비그룹·비멤버 노드(자기 크기).
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 140, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))

  const metaIdOf = (nodeId: string): string => groupOf.get(nodeId) ?? nodeId

  for (const gid of groupIds) {
    const pk = packedByGroup.get(gid)
    if (pk) g.setNode(gid, { width: pk.width, height: pk.height })
  }
  for (const n of nodes) {
    if (groupIds.has(n.id)) continue
    if (groupOf.has(n.id)) continue // 그룹 멤버는 블록에 흡수
    const { width, height } = nodeSize(n)
    g.setNode(n.id, { width, height })
  }

  const seen = new Set<string>()
  for (const e of edges) {
    if ((e.data as { isEnumLink?: boolean } | undefined)?.isEnumLink) continue
    const s = metaIdOf(e.source)
    const t = metaIdOf(e.target)
    if (s === t) continue
    if (!g.hasNode(s) || !g.hasNode(t)) continue
    const key = `${s} ${t}`
    if (seen.has(key)) continue
    seen.add(key)
    g.setEdge(s, t)
  }

  dagre.layout(g)

  const metaTopLeft = (id: string): { x: number; y: number } => {
    const laid = g.node(id)
    if (!laid) return { x: 0, y: 0 }
    return { x: laid.x - laid.width / 2, y: laid.y - laid.height / 2 }
  }

  // 3) 펼치기: 그룹 박스/멤버, 미분류 노드 좌표 확정.
  const result = nodes.map((node) => {
    if (groupIds.has(node.id)) {
      const pk = packedByGroup.get(node.id)
      if (!pk) return node // 멤버 없는 그룹은 그대로
      const tl = metaTopLeft(node.id)
      return {
        ...node,
        position: tl,
        style: { ...node.style, width: pk.width, height: pk.height },
      }
    }
    const gid = groupOf.get(node.id)
    if (gid) {
      const pk = packedByGroup.get(gid)
      const m = pk?.packed.find((p) => p.id === node.id)
      return m ? { ...node, position: m.position } : node
    }
    // 미분류 top-level 노드.
    return { ...node, position: metaTopLeft(node.id) }
  })

  // 4) 그룹 박스 겹침 방지(멤버는 parentId로 따라감).
  return separateGroups(result)
}
