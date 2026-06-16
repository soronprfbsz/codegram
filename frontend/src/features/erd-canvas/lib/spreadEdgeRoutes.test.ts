import { describe, it, expect } from 'vitest'
import { spreadEdgeRoutes } from './spreadEdgeRoutes'
import type { Point } from './routeOrthogonal'

const isOrtho = (pts: Point[]) =>
  pts.every((p, i) => i === 0 || p.x === pts[i - 1].x || p.y === pts[i - 1].y)

describe('spreadEdgeRoutes', () => {
  it('returns inputs unchanged when nothing overlaps', () => {
    const a: Point[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 100 }]
    const out = spreadEdgeRoutes([{ id: 'a', points: a }])
    expect(out.get('a')).toEqual(a)
  })

  it('does NOT move endpoint stub segments (anchors stay put)', () => {
    const a: Point[] = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 80 }, { x: 200, y: 80 }]
    const b: Point[] = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 90 }, { x: 200, y: 90 }]
    const out = spreadEdgeRoutes([{ id: 'a', points: a }, { id: 'b', points: b }])
    expect(out.get('a')![0]).toEqual({ x: 0, y: 0 })
    expect(out.get('b')![0]).toEqual({ x: 0, y: 0 })
    expect(out.get('a')![out.get('a')!.length - 1]).toEqual({ x: 200, y: 80 })
  })

  it('spreads two distinct edges sharing an interior vertical corridor onto different X', () => {
    const a: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }]
    const b: Point[] = [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 250 }, { x: 300, y: 250 }]
    const out = spreadEdgeRoutes([{ id: 'a', points: a }, { id: 'b', points: b }], 12)
    const aVx = out.get('a')![1].x
    const bVx = out.get('b')![1].x
    expect(aVx).not.toBe(bVx)
    expect(Math.abs(aVx - bVx)).toBe(12)
    expect(isOrtho(out.get('a')!)).toBe(true)
    expect(isOrtho(out.get('b')!)).toBe(true)
    expect(out.get('a')![0]).toEqual({ x: 0, y: 0 })
    expect(out.get('a')![3]).toEqual({ x: 300, y: 200 })
  })

  it('leaves a single edge untouched even if its own segments are collinear', () => {
    const a: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }]
    const out = spreadEdgeRoutes([{ id: 'a', points: a }])
    expect(out.get('a')).toEqual(a)
  })

  it('keeps the shifted interior segment connected (orthogonal) to its neighbours', () => {
    const a: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }]
    const b: Point[] = [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 250 }, { x: 300, y: 250 }]
    const out = spreadEdgeRoutes([{ id: 'a', points: a }, { id: 'b', points: b }], 12)
    // For edge a, after shifting the vertical (points[1]-points[2]) in X, points[1]
    // must still share x with points[2] (segment stayed vertical) and the stub
    // points[0]-points[1] stayed horizontal (same y).
    const pa = out.get('a')!
    expect(pa[1].x).toBe(pa[2].x)        // interior vertical still vertical
    expect(pa[0].y).toBe(pa[1].y)        // first stub still horizontal
    expect(pa[2].y).toBe(pa[3].y)        // last stub still horizontal
  })
})
