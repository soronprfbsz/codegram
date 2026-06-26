// frontend/src/entities/erd/lib/groupedLayout.test.ts
import { describe, it, expect } from 'vitest'
import { packGroupedLayout } from './groupedLayout'
import { nodeSize, GROUP_PAD_TOP, GROUP_PAD_BOTTOM } from './nodeSize'
import type { ErdFlowNode } from '@/entities/erd/model/types'

function table(id: string, cols: number, parentId?: string): ErdFlowNode {
  return {
    id,
    type: 'table',
    position: { x: 0, y: 0 },
    data: { tableName: id, tableId: id, columns: Array.from({ length: cols }, (_, i) => ({ id: `${id}.c${i}`, name: `c${i}`, type: 'int', pk: false, fk: false, nn: false, unique: false })) },
    ...(parentId ? { parentId } : {}),
  } as ErdFlowNode
}
function group(id: string): ErdFlowNode {
  return { id, type: 'group', position: { x: 0, y: 0 }, data: { groupName: id } } as ErdFlowNode
}

describe('packGroupedLayout', () => {
  it('packs a group of 6 same-size members into a compact grid (not one tall column)', () => {
    const g = group('group:G')
    const members = Array.from({ length: 6 }, (_, i) => table(`public.t${i}`, 3, 'group:G'))
    const out = packGroupedLayout([g, ...members], [])

    const box = out.find((n) => n.id === 'group:G')!
    const memberH = nodeSize(members[0]).height
    const allVertical = 6 * memberH + 5 * 80 + GROUP_PAD_TOP + GROUP_PAD_BOTTOM
    expect(box.style!.height as number).toBeLessThan(allVertical * 0.6)
  })

  it('keeps every member inside its group box (relative coords ≥ 0, within size)', () => {
    const g = group('group:G')
    const members = Array.from({ length: 4 }, (_, i) => table(`public.t${i}`, 2, 'group:G'))
    const out = packGroupedLayout([g, ...members], [])
    const box = out.find((n) => n.id === 'group:G')!
    for (const m of out.filter((n) => n.parentId === 'group:G')) {
      const { width, height } = nodeSize(m)
      expect(m.position.x).toBeGreaterThanOrEqual(0)
      expect(m.position.y).toBeGreaterThanOrEqual(0)
      expect(m.position.x + width).toBeLessThanOrEqual(box.style!.width as number)
      expect(m.position.y + height).toBeLessThanOrEqual(box.style!.height as number)
    }
  })

  it('separates two groups so their boxes do not overlap', () => {
    const ga = group('group:A')
    const gb = group('group:B')
    const am = Array.from({ length: 3 }, (_, i) => table(`public.a${i}`, 2, 'group:A'))
    const bm = Array.from({ length: 3 }, (_, i) => table(`public.b${i}`, 2, 'group:B'))
    const out = packGroupedLayout([ga, gb, ...am, ...bm], [])
    const A = out.find((n) => n.id === 'group:A')!
    const B = out.find((n) => n.id === 'group:B')!
    const ax2 = A.position.x + (A.style!.width as number)
    const bx2 = B.position.x + (B.style!.width as number)
    const ay2 = A.position.y + (A.style!.height as number)
    const by2 = B.position.y + (B.style!.height as number)
    const overlapX = Math.min(ax2, bx2) - Math.max(A.position.x, B.position.x)
    const overlapY = Math.min(ay2, by2) - Math.max(A.position.y, B.position.y)
    expect(overlapX <= 0 || overlapY <= 0).toBe(true)
  })

  it('places an ungrouped table as a top-level node (no parentId, finite coords)', () => {
    const g = group('group:G')
    const m = table('public.inG', 2, 'group:G')
    const free = table('public.free', 2)
    const out = packGroupedLayout([g, m, free], [])
    const f = out.find((n) => n.id === 'public.free')!
    expect(f.parentId).toBeUndefined()
    expect(Number.isFinite(f.position.x)).toBe(true)
    expect(Number.isFinite(f.position.y)).toBe(true)
  })

  it('unrelated (edge-less) ungrouped tables spread into a balanced grid, not one tall column', () => {
    // A group + many unrelated ungrouped tables with NO edges: before the fix
    // dagre piled them all into rank 0 (a single vertical column).
    const g = group('group:G')
    const m = table('public.inG', 2, 'group:G')
    const free = Array.from({ length: 9 }, (_, i) => table(`public.t${i}`, 2))
    const out = packGroupedLayout([g, m, ...free], [])
    const freeOut = out.filter((n) => n.id.startsWith('public.t'))
    const distinctX = new Set(freeOut.map((n) => Math.round(n.position.x)))
    const distinctY = new Set(freeOut.map((n) => Math.round(n.position.y)))
    // Must use more than one column (otherwise it's the old vertical stack).
    expect(distinctX.size).toBeGreaterThan(1)
    expect(distinctY.size).toBeGreaterThan(1)
    // And it must not be a 1-wide column: rows ≈ ceil(9/cols) < 9.
    expect(distinctY.size).toBeLessThan(free.length)
  })
})
