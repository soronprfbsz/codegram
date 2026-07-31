import { describe, it, expect } from 'vitest'
import { nodeSize, STICKY_WIDTH, STICKY_HEIGHT } from './nodeSize'
import type { ErdFlowNode } from '@/entities/erd/model/types'

function stickyNode(scale?: number): ErdFlowNode {
  return {
    id: 'note:history',
    type: 'sticky',
    position: { x: 0, y: 0 },
    data: { title: 'history', content: 'memo', ...(scale !== undefined ? { scale } : {}) },
  }
}

describe('nodeSize (sticky note)', () => {
  it('reports the base box at the default scale', () => {
    expect(nodeSize(stickyNode())).toEqual({
      width: STICKY_WIDTH,
      height: STICKY_HEIGHT,
    })
  })

  it('scales both axes by the note scale', () => {
    expect(nodeSize(stickyNode(2))).toEqual({
      width: STICKY_WIDTH * 2,
      height: STICKY_HEIGHT * 2,
    })
  })

  it('clamps an out-of-range stored scale', () => {
    expect(nodeSize(stickyNode(99))).toEqual({
      width: STICKY_WIDTH * 3,
      height: STICKY_HEIGHT * 3,
    })
  })
})
