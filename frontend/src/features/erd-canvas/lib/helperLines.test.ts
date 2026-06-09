import { describe, it, expect } from 'vitest'
import type { ErdFlowNode } from '@/entities/erd'
import { getHelperLines } from './helperLines'

// nodeSize gives table width 240, height 40 + cols*26. Use measured to be explicit.
function node(id: string, x: number, y: number, w = 240, h = 100): ErdFlowNode {
  return {
    id, type: 'table', position: { x, y },
    measured: { width: w, height: h },
    data: { tableName: id, tableId: id, columns: [] },
  } as ErdFlowNode
}

describe('getHelperLines', () => {
  it('snaps left edges when within threshold and reports the guide x', () => {
    const dragged = node('d', 503, 200)   // other left = 500, diff 3 < 6
    const other = node('o', 500, 600)
    const r = getHelperLines(dragged, [other])
    expect(r.snapX).toBe(500)
    expect(r.vertical).toBe(500)
  })
  it('snaps top edges (horizontal guide)', () => {
    const dragged = node('d', 100, 402)   // other top = 400, diff 2 < 6
    const other = node('o', 700, 400)
    const r = getHelperLines(dragged, [other])
    expect(r.snapY).toBe(400)
    expect(r.horizontal).toBe(400)
  })
  it('aligns centers (different widths so only the center is within threshold)', () => {
    const other = node('o', 500, 0, 240, 100)        // centerX = 620
    const dragged = node('d', 572, 300, 100, 100)     // width 100, centerX = 622; lefts/rights far apart
    const r = getHelperLines(dragged, [other])
    expect(r.snapX).toBe(570)   // snap left so centerX aligns to 620
    expect(r.vertical).toBe(620)
  })
  it('returns nothing beyond the threshold', () => {
    const r = getHelperLines(node('d', 600, 200), [node('o', 500, 600)])
    expect(r.snapX).toBeUndefined()
    expect(r.vertical).toBeUndefined()
  })
})
