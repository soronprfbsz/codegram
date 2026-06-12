// frontend/src/entities/layout/lib/arrangeGroup.ts
/**
 * PURE 그룹 1개 제자리 정리 (ADR-0010 2026-06-12). 지정 그룹의 멤버만 콤팩트
 * 그리드로 다시 패킹하고 박스를 그 멤버에 맞게 재계산하되, 박스의 좌상단
 * 기준점(position)은 유지한다. 다른 그룹·미분류 노드는 건드리지 않는다.
 *
 * entities layer: entities/erd(gridLayout·nodeSize·geometry)만 의존. 순수.
 */
import { gridLayout, nodeSize, GROUP_PAD_X, GROUP_PAD_TOP, GROUP_PAD_BOTTOM } from '@/entities/erd'
import type { ErdFlowNode } from '@/entities/erd'

export function arrangeGroupInPlace(
  nodes: ErdFlowNode[],
  groupId: string,
): ErdFlowNode[] {
  const groupNode = nodes.find((n) => n.id === groupId && n.type === 'group')
  if (!groupNode) return nodes
  const members = nodes.filter((n) => n.parentId === groupId)
  if (members.length === 0) return nodes

  // gridLayout은 (0,0)부터 절대 배치 → 콘텐츠 좌표로 사용.
  const laid = gridLayout(members, [])
  const relById = new Map<string, { x: number; y: number }>()
  let maxX = 0
  let maxY = 0
  for (const m of laid) {
    const { width, height } = nodeSize(m)
    relById.set(m.id, { x: m.position.x + GROUP_PAD_X, y: m.position.y + GROUP_PAD_TOP })
    maxX = Math.max(maxX, m.position.x + width)
    maxY = Math.max(maxY, m.position.y + height)
  }
  const width = maxX + GROUP_PAD_X * 2
  const height = maxY + GROUP_PAD_TOP + GROUP_PAD_BOTTOM

  return nodes.map((n) => {
    if (n.id === groupId) {
      return { ...n, style: { ...n.style, width, height } } // position(좌상단) 유지
    }
    const rel = relById.get(n.id)
    return rel ? { ...n, position: rel } : n
  })
}
