import { describe, it, expect } from 'vitest'
import { seedNoteScales } from './seedNoteScales'
import type { ErdFlowNode } from '@/entities/erd'

function stickyNode(id: string, scale?: number): ErdFlowNode {
  return {
    id,
    type: 'sticky',
    position: { x: 0, y: 0 },
    data: { title: id, content: 'memo', ...(scale !== undefined ? { scale } : {}) },
  }
}

function tableNode(id: string): ErdFlowNode {
  return {
    id,
    type: 'table',
    position: { x: 0, y: 0 },
    data: { tableName: id, tableId: id, columns: [] },
  }
}

describe('seedNoteScales', () => {
  it('copies the scale for a matching sticky id', () => {
    const fresh = [stickyNode('note:history')]
    const live = [stickyNode('note:history', 2.4)]
    const out = seedNoteScales(fresh, live)
    expect(out.find((n) => n.id === 'note:history')!.data).toMatchObject({ scale: 2.4 })
  })

  it('leaves non-sticky nodes alone', () => {
    const fresh = [tableNode('public.users')]
    const live = [tableNode('public.users')]
    const out = seedNoteScales(fresh, live)
    expect(out[0]).toBe(fresh[0])
  })

  it('leaves a sticky with no live counterpart alone', () => {
    const fresh = [stickyNode('note:new')]
    const live = [stickyNode('note:history', 2.4)]
    const out = seedNoteScales(fresh, live)
    expect(out[0]).toBe(fresh[0])
    expect((out[0].data as { scale?: number }).scale).toBeUndefined()
  })

  it('ignores a live node whose id no longer exists among the fresh nodes', () => {
    const fresh = [stickyNode('note:history')]
    const live = [stickyNode('note:history', 2.4), stickyNode('note:deleted', 3)]
    const out = seedNoteScales(fresh, live)
    expect(out).toHaveLength(1)
    expect((out[0].data as { scale?: number }).scale).toBe(2.4)
  })

  it('returns the same node object when there is nothing to copy', () => {
    const fresh = [stickyNode('note:history')]
    const live = [stickyNode('note:history')] // no scale on the live node either
    const out = seedNoteScales(fresh, live)
    expect(out[0]).toBe(fresh[0])
  })
})
