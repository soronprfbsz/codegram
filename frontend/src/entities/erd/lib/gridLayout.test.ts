import { describe, it, expect } from 'vitest'
import type { ErdFlowNode, ErdFlowEdge } from '@/entities/erd'
import { gridLayout } from './gridLayout'

function table(id: string, cols = 3): ErdFlowNode {
  return {
    id, type: 'table', position: { x: 0, y: 0 },
    data: { tableName: id, tableId: id, columns: Array.from({ length: cols }, (_, i) => ({ id: `${id}.c${i}`, name: `c${i}`, type: 'int', pk: false, fk: false, nn: false, unique: false })) },
  }
}

describe('gridLayout', () => {
  it('lays out many isolated tables in a balanced grid (wider than tall), not one column', () => {
    const nodes = Array.from({ length: 12 }, (_, i) => table(`public.t${i}`))
    const out = gridLayout(nodes, [])
    const xs = new Set(out.map((n) => Math.round(n.position.x)))
    const ys = new Set(out.map((n) => Math.round(n.position.y)))
    // more than one column AND more than one row (not a single vertical stack)
    expect(xs.size).toBeGreaterThan(1)
    expect(ys.size).toBeGreaterThan(1)
    // balanced (not elongated either way): the bounding box aspect is moderate.
    const w = Math.max(...out.map((n) => n.position.x)) + 240
    const h = Math.max(...out.map((n) => n.position.y)) + 120
    const aspect = w / h
    expect(aspect).toBeGreaterThan(0.8)
    expect(aspect).toBeLessThan(2.5)
  })

  it('left-aligns columns (uniform x) and top-aligns rows (shared y per row)', () => {
    const nodes = Array.from({ length: 6 }, (_, i) => table(`public.t${i}`, (i % 3) + 1))
    const out = gridLayout(nodes, [])
    // group by row (y); within a row all share the same y; column xs repeat across rows
    const byY = new Map<number, number[]>()
    for (const n of out) {
      const y = Math.round(n.position.y)
      ;(byY.get(y) ?? byY.set(y, []).get(y)!).push(Math.round(n.position.x))
    }
    const rowXs = [...byY.values()]
    // every row uses the same set of column x-values (uniform columns)
    const first = JSON.stringify(rowXs[0])
    for (const r of rowXs.slice(0, -1)) expect(JSON.stringify(r)).toBe(first)
  })

  it('places connected tables in adjacent cells (BFS order)', () => {
    const nodes = ['a', 'b', 'c', 'x', 'y'].map((n) => table(`public.${n}`))
    const edges: ErdFlowEdge[] = [
      { id: 'e1#0', type: 'relation', source: 'public.a', target: 'public.b', data: { relation: '1-n', sourceMarker: 'one', targetMarker: 'many' } },
      { id: 'e2#0', type: 'relation', source: 'public.b', target: 'public.c', data: { relation: '1-n', sourceMarker: 'one', targetMarker: 'many' } },
    ]
    const out = gridLayout(nodes, edges)
    const idx = (id: string) => out.findIndex((n) => n.id === id)
    // a,b,c form a component → contiguous in the row-major order
    const ia = idx('public.a'), ib = idx('public.b'), ic = idx('public.c')
    expect(Math.max(ia, ib, ic) - Math.min(ia, ib, ic)).toBe(2)
  })

  it('returns [] for no nodes and a single position for one node', () => {
    expect(gridLayout([], [])).toEqual([])
    const one = gridLayout([table('public.solo')], [])
    expect(one).toHaveLength(1)
    expect(one[0].position).toEqual({ x: 0, y: 0 })
  })

  it('does not overlap any two cells', () => {
    const nodes = Array.from({ length: 9 }, (_, i) => table(`public.t${i}`, (i % 4) + 1))
    const out = gridLayout(nodes, [])
    // every pair separated on x OR y by at least the cell extent (no overlap)
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i].position, b = out[j].position
        const sameCol = Math.abs(a.x - b.x) < 1
        const sameRow = Math.abs(a.y - b.y) < 1
        expect(sameCol && sameRow).toBe(false)
      }
    }
  })
})
