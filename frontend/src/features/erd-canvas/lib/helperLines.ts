/**
 * PURE drag-time alignment helper (design-tool "smart guides"). Given the node
 * being dragged and the others, find the closest alignment on each axis among
 * the 9 edge/center combinations (left|center|right × left|center|right for X;
 * top|middle|bottom for Y) within `dist`. Returns the snapped top-left
 * (snapX/snapY) and the absolute guide-line coords (vertical/horizontal).
 *
 * features layer: imports entities/erd types + nodeSize (FSD downward).
 */
import type { ErdFlowNode } from '@/entities/erd'
import { nodeSize } from '@/entities/erd'

export interface HelperLinesResult {
  snapX?: number
  snapY?: number
  vertical?: number
  horizontal?: number
}

function dims(n: ErdFlowNode): { w: number; h: number } {
  const m = (n as { measured?: { width?: number; height?: number } }).measured
  if (m?.width && m?.height) return { w: m.width, h: m.height }
  const s = nodeSize(n)
  return { w: s.width, h: s.height }
}

export function getHelperLines(
  dragged: ErdFlowNode,
  others: ErdFlowNode[],
  dist = 6,
): HelperLinesResult {
  const { w, h } = dims(dragged)
  const dl = dragged.position.x
  const dcx = dl + w / 2
  const dr = dl + w
  const dt = dragged.position.y
  const dcy = dt + h / 2
  const db = dt + h

  const res: HelperLinesResult = {}
  let bestX = dist
  let bestY = dist

  for (const o of others) {
    const { w: ow, h: oh } = dims(o)
    const ol = o.position.x
    const ocx = ol + ow / 2
    const or = ol + ow
    const ot = o.position.y
    const ocy = ot + oh / 2
    const ob = ot + oh

    // X: [draggedEdgeValue, otherGuideX, snappedLeftX]
    const xs: Array<[number, number, number]> = [
      [dl, ol, ol], [dl, ocx, ocx], [dl, or, or],
      [dcx, ol, ol - w / 2], [dcx, ocx, ocx - w / 2], [dcx, or, or - w / 2],
      [dr, ol, ol - w], [dr, ocx, ocx - w], [dr, or, or - w],
    ]
    for (const [val, line, snapLeft] of xs) {
      const d = Math.abs(val - line)
      if (d < bestX) { bestX = d; res.snapX = snapLeft; res.vertical = line }
    }

    // Y: [draggedEdgeValue, otherGuideY, snappedTopY]
    const ys: Array<[number, number, number]> = [
      [dt, ot, ot], [dt, ocy, ocy], [dt, ob, ob],
      [dcy, ot, ot - h / 2], [dcy, ocy, ocy - h / 2], [dcy, ob, ob - h / 2],
      [db, ot, ot - h], [db, ocy, ocy - h], [db, ob, ob - h],
    ]
    for (const [val, line, snapTop] of ys) {
      const d = Math.abs(val - line)
      if (d < bestY) { bestY = d; res.snapY = snapTop; res.horizontal = line }
    }
  }

  return res
}
