// frontend/src/entities/layout/lib/arrangeGroup.test.ts
import { describe, it, expect } from 'vitest'
import { arrangeGroupInPlace } from './arrangeGroup'
import { nodeSize } from '@/entities/erd'
import type { ErdFlowNode } from '@/entities/erd'

function table(id: string, cols: number, parentId: string, x: number, y: number): ErdFlowNode {
  return {
    id, type: 'table', parentId, position: { x, y },
    data: { tableName: id, tableId: id, columns: Array.from({ length: cols }, (_, i) => ({ id: `${id}.c${i}`, name: `c${i}`, type: 'int', pk: false, fk: false, nn: false, unique: false })) },
  } as ErdFlowNode
}
function group(id: string, x: number, y: number, w: number, h: number): ErdFlowNode {
  return { id, type: 'group', position: { x, y }, style: { width: w, height: h }, data: { groupName: id } } as ErdFlowNode
}

describe('arrangeGroupInPlace', () => {
  it('keeps the group box top-left fixed and only touches that group', () => {
    const g = group('group:G', 500, 300, 50, 9999)
    const members = Array.from({ length: 4 }, (_, i) => table(`public.t${i}`, 2, 'group:G', 0, i * 400))
    const free: ErdFlowNode = { ...table('public.free', 2, '', 10, 20), parentId: undefined } as ErdFlowNode
    const out = arrangeGroupInPlace([g, ...members, free], 'group:G')

    const box = out.find((n) => n.id === 'group:G')!
    expect(box.position).toEqual({ x: 500, y: 300 })
    expect(out.find((n) => n.id === 'public.free')!.position).toEqual({ x: 10, y: 20 })
  })

  it('packs members into a compact box (shorter than the degenerate vertical stack)', () => {
    const g = group('group:G', 0, 0, 50, 5000)
    const members = Array.from({ length: 6 }, (_, i) => table(`public.t${i}`, 3, 'group:G', 0, i * 400))
    const out = arrangeGroupInPlace([g, ...members], 'group:G')
    const box = out.find((n) => n.id === 'group:G')!
    const memberH = nodeSize(members[0]).height
    expect(box.style!.height as number).toBeLessThan(6 * memberH)
    for (const m of out.filter((n) => n.parentId === 'group:G')) {
      const { width, height } = nodeSize(m)
      expect(m.position.x).toBeGreaterThanOrEqual(0)
      expect(m.position.y).toBeGreaterThanOrEqual(0)
      expect(m.position.x + width).toBeLessThanOrEqual(box.style!.width as number)
      expect(m.position.y + height).toBeLessThanOrEqual(box.style!.height as number)
    }
  })

  it('returns input unchanged when the group id is unknown or has no members', () => {
    const g = group('group:G', 0, 0, 50, 50)
    expect(arrangeGroupInPlace([g], 'group:NOPE')).toEqual([g])
    expect(arrangeGroupInPlace([g], 'group:G')).toEqual([g])
  })
})
