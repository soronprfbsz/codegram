import { describe, it, expect } from 'vitest'
import {
  routeOrthogonal,
  polylineToPath,
  type Rect,
  type Point,
} from './routeOrthogonal'

/** True if axis-aligned segment a→b passes through rect r's interior. */
function segCrosses(a: Point, b: Point, r: Rect): boolean {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  return maxX > r.x && minX < r.x + r.width && maxY > r.y && minY < r.y + r.height
}

function pathAvoids(points: Point[], obstacles: Rect[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    for (const o of obstacles) {
      if (segCrosses(points[i], points[i + 1], o)) return false
    }
  }
  return true
}

function isOrthogonal(points: Point[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (a.x !== b.x && a.y !== b.y) return false
  }
  return true
}

describe('routeOrthogonal', () => {
  it('routes around an obstacle that blocks the straight line', () => {
    const source = { x: 0, y: 0 }
    const target = { x: 400, y: 0 }
    // A node spanning y -50..50 sits across the straight y=0 line.
    const obstacle: Rect = { x: 150, y: -50, width: 100, height: 100 }
    const pts = routeOrthogonal(source, target, 'right', 'left', [obstacle])
    expect(pts[0]).toEqual(source)
    expect(pts[pts.length - 1]).toEqual(target)
    expect(isOrthogonal(pts)).toBe(true)
    expect(pathAvoids(pts, [obstacle])).toBe(true)
    // It had to detour vertically (more than a single straight segment).
    expect(pts.length).toBeGreaterThan(2)
  })

  it('routes around several obstacles without crossing any interior', () => {
    const source = { x: 0, y: 0 }
    const target = { x: 600, y: 300 }
    const obstacles: Rect[] = [
      { x: 150, y: -40, width: 100, height: 120 },
      { x: 350, y: 100, width: 120, height: 120 },
      { x: 200, y: 250, width: 120, height: 120 },
    ]
    const pts = routeOrthogonal(source, target, 'right', 'left', obstacles)
    expect(isOrthogonal(pts)).toBe(true)
    expect(pathAvoids(pts, obstacles)).toBe(true)
    expect(pts[0]).toEqual(source)
    expect(pts[pts.length - 1]).toEqual(target)
  })

  it('gives a near-straight route when nothing is in the way', () => {
    const pts = routeOrthogonal({ x: 0, y: 0 }, { x: 300, y: 0 }, 'right', 'left', [])
    expect(isOrthogonal(pts)).toBe(true)
    // source → (mostly) straight → target; no vertical detour needed.
    const ys = new Set(pts.map((p) => p.y))
    expect(ys.size).toBe(1)
  })

  it('pushes the target approach lane out by targetLaneOffset (per-PK fan-out)', () => {
    const source = { x: 0, y: 0 }
    const target = { x: 400, y: 100 }
    // Lane 0 (offset 0) turns at target.x - STEP_OUT(30) = 370.
    const lane0 = routeOrthogonal(source, target, 'right', 'left', [], undefined, 0)
    // Lane 2 (offset 28) turns 28px further from the table: 370 - 28 = 342.
    const lane2 = routeOrthogonal(source, target, 'right', 'left', [], undefined, 28)

    const turnX = (pts: Point[]) =>
      // the vertical approach lane = x of the point just before the target.
      pts[pts.length - 2].x
    expect(turnX(lane0)).toBe(370)
    expect(turnX(lane2)).toBe(342)
    // Both still terminate exactly at the target handle.
    expect(lane0[lane0.length - 1]).toEqual(target)
    expect(lane2[lane2.length - 1]).toEqual(target)
  })

  it('does not tunnel under an endpoint card when that card is an obstacle', () => {
    // Regression: the source card's RIGHT-edge anchor with the target sitting
    // BEHIND it (to the lower-left). When the endpoint cards are supplied as
    // obstacles (the caller now does this), the route must detour AROUND the
    // source card instead of running a segment straight through its interior —
    // which the HTML node layer would paint over (invisible "tunnel").
    const sourceCard: Rect = { x: 0, y: 0, width: 240, height: 80 }
    const targetCard: Rect = { x: -400, y: 200, width: 240, height: 80 }
    const source = { x: 240, y: 40 } // right edge of sourceCard
    const target = { x: -160, y: 240 } // right edge of targetCard (swapped side)
    const pts = routeOrthogonal(source, target, 'right', 'right', [
      sourceCard,
      targetCard,
    ])
    expect(pts[0]).toEqual(source)
    expect(pts[pts.length - 1]).toEqual(target)
    expect(isOrthogonal(pts)).toBe(true)
    // The whole polyline stays out of BOTH endpoint card interiors.
    expect(pathAvoids(pts, [sourceCard, targetCard])).toBe(true)
  })

  describe('routeOrthogonal sourceLaneOffset (source-side fan-out)', () => {
    it('with offset 0, two facing endpoints route on a single straight line', () => {
      const pts = routeOrthogonal({ x: 0, y: 0 }, { x: 300, y: 0 }, 'right', 'left', [], undefined, 0, 0)
      expect(isOrthogonal(pts)).toBe(true)
      const ys = new Set(pts.map((p) => p.y))
      expect(ys.size).toBe(1) // no jog when offset is 0
    })

    it('offsets the source exit corridor by sourceLaneOffset (Y), staying orthogonal', () => {
      // Same endpoints, lane 1 (offset 20) must leave the source row and travel on y=20.
      const pts = routeOrthogonal({ x: 0, y: 0 }, { x: 300, y: 0 }, 'right', 'left', [], undefined, 0, 20)
      expect(isOrthogonal(pts)).toBe(true)
      expect(pts[0]).toEqual({ x: 0, y: 0 }) // still anchored at the source handle
      expect(pts[pts.length - 1]).toEqual({ x: 300, y: 0 }) // still anchored at the target handle
      // The long horizontal travel happens at the offset Y (20), not the source row (0).
      const ysVisited = pts.map((p) => p.y)
      expect(ysVisited).toContain(20)
      // There is an L-stub at the source: a horizontal step out then a vertical jog to y=20.
      expect(pts[1]).toEqual({ x: 30, y: 0 }) // STEP_OUT stub at source row (STEP_OUT=30)
      expect(pts[2]).toEqual({ x: 30, y: 20 }) // vertical jog to the lane corridor
    })

    it('two co-source edges (lanes 0 and 1) end up on DIFFERENT horizontal corridors', () => {
      const lane0 = routeOrthogonal({ x: 0, y: 0 }, { x: 300, y: 100 }, 'right', 'left', [], undefined, 0, 0)
      const lane1 = routeOrthogonal({ x: 0, y: 0 }, { x: 300, y: 140 }, 'right', 'left', [], undefined, 0, 20)
      // The Y at which each edge leaves the source neighbourhood differs by the lane offset.
      expect(lane0[1].y).toBe(0)
      expect(lane1[2].y).toBe(20)
    })

    it('mirrors the L-stub when the source exits on the LEFT side', () => {
      // Source exits left toward a facing target on the left; the step-out is at
      // x=-30 (STEP_OUT) and the vertical jog still moves to the offset corridor.
      const pts = routeOrthogonal({ x: 0, y: 0 }, { x: -300, y: 0 }, 'left', 'right', [], undefined, 0, 20)
      expect(isOrthogonal(pts)).toBe(true)
      expect(pts[1]).toEqual({ x: -30, y: 0 }) // STEP_OUT stub on the left
      expect(pts[2]).toEqual({ x: -30, y: 20 }) // vertical jog to the lane corridor
    })
  })

  describe('routeOrthogonal sourceTrunkOffset (perpendicular trunk fan)', () => {
    // A target card BELOW-RIGHT forces the route to leave the source and travel
    // vertically along the step-out X — the trunk. Without such a trunk the
    // route runs straight out along the source row and simplify() collapses the
    // step-out corner, so the trunk offset is only observable once a vertical
    // trunk actually materialises.
    const obstacle = { x: 260, y: 120, width: 240, height: 200 }

    it('with offset 0 the source step-out sits at the plain STEP_OUT', () => {
      const pts = routeOrthogonal({ x: 0, y: 0 }, { x: 260, y: 200 }, 'right', 'left', [obstacle], undefined, 0, 0, 0)
      expect(isOrthogonal(pts)).toBe(true)
      expect(pts[0]).toEqual({ x: 0, y: 0 }) // anchored at the source handle
      expect(pts[1].x).toBe(30) // step-out at STEP_OUT, no trunk push
    })

    it('pushes the source step-out port out by sourceTrunkOffset (right side)', () => {
      const pts = routeOrthogonal({ x: 0, y: 0 }, { x: 260, y: 200 }, 'right', 'left', [obstacle], undefined, 0, 0, 14)
      expect(isOrthogonal(pts)).toBe(true)
      expect(pts[0]).toEqual({ x: 0, y: 0 })
      expect(pts[1].x).toBe(44) // STEP_OUT(30) + trunkOffset(14)
      expect(pts[pts.length - 1]).toEqual({ x: 260, y: 200 }) // still anchored at target
    })

    it('mirrors the push to the LEFT when the source exits on the left side', () => {
      const obstacleL = { x: -500, y: 120, width: 240, height: 200 }
      const pts = routeOrthogonal({ x: 0, y: 0 }, { x: -260, y: 200 }, 'left', 'right', [obstacleL], undefined, 0, 0, 14)
      expect(isOrthogonal(pts)).toBe(true)
      expect(pts[1].x).toBe(-44) // -(STEP_OUT + trunkOffset)
    })

    it('two co-source edges to vertically-stacked targets run on DIFFERENT trunk X', () => {
      // A target card BELOW-RIGHT forces the route to leave the source and travel
      // vertically along the step-out X — the trunk. Two lanes must use different X.
      const obstacles = [{ x: 260, y: 120, width: 240, height: 200 }]
      const lane0 = routeOrthogonal({ x: 0, y: 0 }, { x: 260, y: 200 }, 'right', 'left', obstacles, undefined, 0, 0, 0)
      const lane1 = routeOrthogonal({ x: 0, y: 0 }, { x: 260, y: 260 }, 'right', 'left', obstacles, undefined, 0, 0, 14)
      // The step-out / trunk X differs by the trunk offset.
      expect(lane1[1].x - lane0[1].x).toBe(14)
    })
  })

  it('polylineToPath builds an M/L svg path', () => {
    const d = polylineToPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
    ])
    expect(d).toBe('M 0 0 L 10 0 L 10 20')
  })
})
