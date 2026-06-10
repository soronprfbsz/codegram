/**
 * PURE group-overlap separation. dagre's compound layout only spaces member
 * CLUSTERS apart by nodesep/ranksep; the group boxes then grow by the directional
 * insets (GROUP_PAD_*) and can overlap their neighbours. This pass pushes
 * overlapping group boxes apart until every pair is at least `gap` px apart.
 *
 * Only the GROUP nodes move — their members are React Flow children (parentId)
 * with RELATIVE coords, so they follow their group automatically. Deterministic.
 *
 * entities layer: imports only entities/erd types. PURE, no side effects.
 */
import type { ErdFlowNode } from '@/entities/erd/model/types'

const GROUP_GAP = 100

interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function separateGroups(
  nodes: ErdFlowNode[],
  gap = GROUP_GAP,
): ErdFlowNode[] {
  const groups = nodes.filter(
    (n) =>
      n.type === 'group' &&
      typeof n.style?.width === 'number' &&
      typeof n.style?.height === 'number',
  )
  if (groups.length < 2) return nodes

  const box = new Map<string, Box>(
    groups.map((g) => [
      g.id,
      {
        x: g.position.x,
        y: g.position.y,
        w: g.style!.width as number,
        h: g.style!.height as number,
      },
    ]),
  )
  const ids = groups.map((g) => g.id)
  const half = gap / 2

  for (let iter = 0; iter < 80; iter++) {
    let moved = false
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = box.get(ids[i]) as Box
        const b = box.get(ids[j]) as Box
        // Overlap of the boxes each EXPANDED by gap/2 (so a `gap` separation is
        // enforced, not just non-overlap).
        const ex =
          Math.min(a.x + a.w + half, b.x + b.w + half) -
          Math.max(a.x - half, b.x - half)
        const ey =
          Math.min(a.y + a.h + half, b.y + b.h + half) -
          Math.max(a.y - half, b.y - half)
        if (ex <= 0 || ey <= 0) continue // already gap-apart on an axis
        moved = true
        if (ex <= ey) {
          const push = ex / 2
          const acx = a.x + a.w / 2
          const bcx = b.x + b.w / 2
          if (acx <= bcx) {
            a.x -= push
            b.x += push
          } else {
            a.x += push
            b.x -= push
          }
        } else {
          const push = ey / 2
          const acy = a.y + a.h / 2
          const bcy = b.y + b.h / 2
          if (acy <= bcy) {
            a.y -= push
            b.y += push
          } else {
            a.y += push
            b.y -= push
          }
        }
      }
    }
    if (!moved) break
  }

  return nodes.map((n) => {
    const nb = box.get(n.id)
    return nb ? { ...n, position: { x: nb.x, y: nb.y } } : n
  })
}
