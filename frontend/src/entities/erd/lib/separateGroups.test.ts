import { describe, it, expect } from 'vitest'
import type { ErdFlowNode } from '@/entities/erd'
import { separateGroups } from './separateGroups'

function group(id: string, x: number, y: number, w: number, h: number): ErdFlowNode {
  return {
    id,
    type: 'group',
    position: { x, y },
    style: { width: w, height: h },
    data: { groupName: id },
  }
}

function overlaps(a: ErdFlowNode, b: ErdFlowNode): boolean {
  const aw = a.style!.width as number
  const ah = a.style!.height as number
  const bw = b.style!.width as number
  const bh = b.style!.height as number
  const ox = Math.min(a.position.x + aw, b.position.x + bw) - Math.max(a.position.x, b.position.x)
  const oy = Math.min(a.position.y + ah, b.position.y + bh) - Math.max(a.position.y, b.position.y)
  return ox > 0 && oy > 0
}

describe('separateGroups', () => {
  it('pushes two overlapping group boxes apart (no overlap, with a gap)', () => {
    const nodes = [
      group('g1', 0, 0, 300, 200),
      group('g2', 120, 60, 300, 200), // overlaps g1
    ]
    const out = separateGroups(nodes, 100)
    const a = out.find((n) => n.id === 'g1')!
    const b = out.find((n) => n.id === 'g2')!
    expect(overlaps(a, b)).toBe(false)
    // enforced gap: separation on at least one axis >= ~gap
    const gapX = Math.max(a.position.x, b.position.x) - Math.min(a.position.x + 300, b.position.x + 300)
    const gapY = Math.max(a.position.y, b.position.y) - Math.min(a.position.y + 200, b.position.y + 200)
    expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(100 - 1)
  })

  it('separates three mutually overlapping groups so none overlap', () => {
    const nodes = [
      group('g1', 0, 0, 250, 250),
      group('g2', 80, 40, 250, 250),
      group('g3', 40, 90, 250, 250),
    ]
    const out = separateGroups(nodes, 80)
    const gs = out.filter((n) => n.type === 'group')
    for (let i = 0; i < gs.length; i++)
      for (let j = i + 1; j < gs.length; j++)
        expect(overlaps(gs[i], gs[j])).toBe(false)
  })

  it('leaves non-overlapping groups untouched', () => {
    const nodes = [
      group('g1', 0, 0, 200, 200),
      group('g2', 500, 0, 200, 200), // already far apart
    ]
    const out = separateGroups(nodes, 100)
    expect(out.find((n) => n.id === 'g1')!.position).toEqual({ x: 0, y: 0 })
    expect(out.find((n) => n.id === 'g2')!.position).toEqual({ x: 500, y: 0 })
  })

  it('passes through when fewer than two groups', () => {
    const nodes = [group('g1', 0, 0, 200, 200)]
    expect(separateGroups(nodes)).toBe(nodes)
  })
})
