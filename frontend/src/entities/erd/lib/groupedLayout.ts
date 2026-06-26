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

// 고립(엣지 없는) 메타노드 패킹 간격 — 이들 사이엔 관계선이 없어 라우팅 통로가
// 필요 없으므로 조밀하게 둔다(가로 빈 공간 최소화). 연결 블록과 고립 그리드
// 사이 수직 분리는 ISO_BLOCK_GAP.
const ISO_GAP_X = 64
const ISO_GAP_Y = 80
const ISO_BLOCK_GAP = 160
const ISO_TARGET_ASPECT = 1.6 // 전체 직사각형 width:height 목표

interface MetaBox {
  id: string
  width: number
  height: number
}

/**
 * 가변 폭 박스들을 shelf(행 채우기) 방식으로 조밀 패킹한다. 한 행을 목표 폭까지
 * 좌→우로 채우고 넘치면 다음 행으로 내린다(행 높이 = 행 내 최대). 균일 컬럼 폭
 * (= 최대 박스 폭)을 쓰지 않으므로 넓은 박스 하나가 모든 열 간격을 키우던
 * 가로 낭비가 사라진다 — 더 많은 열로 더 조밀하게 모인다. top-left 좌표 맵 +
 * 전체 크기를 반환.
 */
function balancedGridPositions(boxes: MetaBox[]): {
  pos: Map<string, { x: number; y: number }>
  width: number
  height: number
} {
  const pos = new Map<string, { x: number; y: number }>()
  if (boxes.length === 0) return { pos, width: 0, height: 0 }
  // 간격 포함 총 면적으로 ~16:10 직사각형이 되도록 목표 행 폭을 잡는다.
  const totalArea = boxes.reduce(
    (a, b) => a + (b.width + ISO_GAP_X) * (b.height + ISO_GAP_Y),
    0,
  )
  const widest = Math.max(...boxes.map((b) => b.width))
  const targetW = Math.max(widest, Math.sqrt(totalArea * ISO_TARGET_ASPECT))

  let x = 0
  let y = 0
  let rowH = 0
  let width = 0
  for (const b of boxes) {
    if (x > 0 && x + b.width > targetW) {
      x = 0
      y += rowH + ISO_GAP_Y
      rowH = 0
    }
    pos.set(b.id, { x, y })
    x += b.width + ISO_GAP_X
    rowH = Math.max(rowH, b.height)
    width = Math.max(width, x - ISO_GAP_X)
  }
  return { pos, width, height: y + rowH }
}

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

  // 2) 메타 박스: 슈퍼노드 = 그룹(블록 크기) + 비그룹·비멤버 노드(자기 크기).
  const metaIdOf = (nodeId: string): string => groupOf.get(nodeId) ?? nodeId
  const metaBoxes: MetaBox[] = []
  for (const n of nodes) {
    if (groupIds.has(n.id)) {
      const pk = packedByGroup.get(n.id)
      if (pk) metaBoxes.push({ id: n.id, width: pk.width, height: pk.height })
      continue
    }
    if (groupOf.has(n.id)) continue // 그룹 멤버는 블록에 흡수
    const { width, height } = nodeSize(n)
    metaBoxes.push({ id: n.id, width, height })
  }
  const hasMeta = new Set(metaBoxes.map((b) => b.id))

  // 메타 엣지(중복 제거, enum·자기루프 제외) + 어느 메타노드가 "연결"인지.
  const metaEdges: Array<[string, string]> = []
  const connectedIds = new Set<string>()
  const seenEdge = new Set<string>()
  for (const e of edges) {
    if ((e.data as { isEnumLink?: boolean } | undefined)?.isEnumLink) continue
    const s = metaIdOf(e.source)
    const t = metaIdOf(e.target)
    if (s === t || !hasMeta.has(s) || !hasMeta.has(t)) continue
    const key = `${s} ${t}`
    if (seenEdge.has(key)) continue
    seenEdge.add(key)
    metaEdges.push([s, t])
    connectedIds.add(s)
    connectedIds.add(t)
  }

  // 3) 연결된 메타노드는 dagre(LR)로 관계 기반 배치, 고립(엣지 없는) 메타노드는
  //    균형 그리드로 패킹해 dagre 블록 아래에 둔다. (엣지 없는 미연관 테이블이
  //    dagre rank 0에 몰려 한 세로열로 길게 쌓이던 문제 해결.)
  const metaPos = new Map<string, { x: number; y: number }>()

  const connectedBoxes = metaBoxes.filter((b) => connectedIds.has(b.id))
  let connMinX = 0
  let connMaxY = 0
  if (connectedBoxes.length > 0) {
    const g = new dagre.graphlib.Graph()
    // nodesep/ranksep = 그룹 사이 채널 폭. 먼 그룹으로 향하는 버스/평행선이
    // 중간 그룹을 돌아갈 통로를 보장한다.
    g.setGraph({ rankdir: 'LR', nodesep: 160, ranksep: 220, marginx: 20, marginy: 20 })
    g.setDefaultEdgeLabel(() => ({}))
    for (const b of connectedBoxes) g.setNode(b.id, { width: b.width, height: b.height })
    for (const [s, t] of metaEdges) g.setEdge(s, t)
    dagre.layout(g)
    let minX = Infinity
    let maxY = -Infinity
    for (const b of connectedBoxes) {
      const laid = g.node(b.id)
      const x = laid.x - b.width / 2
      const y = laid.y - b.height / 2
      metaPos.set(b.id, { x, y })
      minX = Math.min(minX, x)
      maxY = Math.max(maxY, y + b.height)
    }
    connMinX = Number.isFinite(minX) ? minX : 0
    connMaxY = Number.isFinite(maxY) ? maxY : 0
  }

  const isolatedBoxes = metaBoxes.filter((b) => !connectedIds.has(b.id))
  if (isolatedBoxes.length > 0) {
    const grid = balancedGridPositions(isolatedBoxes)
    const offX = connectedBoxes.length > 0 ? connMinX : 0
    const offY = connectedBoxes.length > 0 ? connMaxY + ISO_BLOCK_GAP : 0
    for (const [id, p] of grid.pos) metaPos.set(id, { x: p.x + offX, y: p.y + offY })
  }

  const metaTopLeft = (id: string): { x: number; y: number } => metaPos.get(id) ?? { x: 0, y: 0 }

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
