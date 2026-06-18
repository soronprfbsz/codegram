import { describe, it, expect } from 'vitest'
import { fitGroupBoxes } from './groupBox'
import {
  GROUP_PAD_X,
  GROUP_PAD_TOP,
  GROUP_PAD_BOTTOM,
  type ErdFlowNode,
} from '@/entities/erd'

/** Empty-column table node (autoLayout nodeSize estimate: 240 x 40). */
function memberNode(id: string, parentId: string, x: number, y: number): ErdFlowNode {
  return {
    id,
    type: 'table',
    position: { x, y },
    parentId,
    data: { tableName: id, tableId: id, columns: [] },
  }
}

function groupNode(id: string, x: number, y: number): ErdFlowNode {
  return {
    id,
    type: 'group',
    position: { x, y },
    style: { width: 10, height: 10 },
    data: { groupName: id },
  }
}

describe('fitGroupBoxes', () => {
  it('expands the group box to cover a member dragged beyond the old box and re-bases members', () => {
    const MEMBER_W = 240
    const MEMBER_H = 40
    // Group originally at absolute (100,100), 10x10. One member sits at the
    // origin; another was "dragged" far to the right (relative x=500) so it
    // falls well outside the old 10x10 box.
    const nodes = [
      groupNode('group:core', 100, 100),
      memberNode('public.a', 'group:core', 0, 0),
      memberNode('public.b', 'group:core', 500, 0),
    ]
    const out = fitGroupBoxes(nodes)
    const group = out.find((n) => n.id === 'group:core')!
    const a = out.find((n) => n.id === 'public.a')!
    const b = out.find((n) => n.id === 'public.b')!

    const groupW = Number(group.style?.width)
    const groupH = Number(group.style?.height)
    // Box spans both members (x range 0..500+240) + roomy X gutters; height adds
    // the top label band and a matching bottom band.
    expect(groupW).toBe(500 + MEMBER_W + GROUP_PAD_X * 2)
    expect(groupH).toBe(MEMBER_H + GROUP_PAD_TOP + GROUP_PAD_BOTTOM)

    // Members re-based relative to the NEW origin: both inside [0, groupSize].
    for (const m of [a, b]) {
      expect(m.position.x).toBeGreaterThanOrEqual(0)
      expect(m.position.y).toBeGreaterThanOrEqual(0)
      expect(m.position.x + MEMBER_W).toBeLessThanOrEqual(groupW)
      expect(m.position.y + MEMBER_H).toBeLessThanOrEqual(groupH)
    }
    // The leftmost/topmost member sits at the X gutter inset, and BELOW the
    // top label band on y.
    expect(a.position).toEqual({
      x: GROUP_PAD_X,
      y: GROUP_PAD_TOP,
    })
  })

  it('leaves a group node with no members untouched', () => {
    const nodes = [groupNode('group:empty', 5, 5)]
    const out = fitGroupBoxes(nodes)
    expect(out[0].position).toEqual({ x: 5, y: 5 })
  })

  it('passes ungrouped nodes through unchanged', () => {
    const lone: ErdFlowNode = {
      id: 'public.solo',
      type: 'table',
      position: { x: 7, y: 9 },
      data: { tableName: 'solo', tableId: 'public.solo', columns: [] },
    }
    const out = fitGroupBoxes([lone])
    expect(out[0].position).toEqual({ x: 7, y: 9 })
  })
})
