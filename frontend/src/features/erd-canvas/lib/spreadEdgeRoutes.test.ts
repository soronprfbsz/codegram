import { describe, it, expect } from 'vitest'
import { spreadEdgeRoutes } from './spreadEdgeRoutes'
import { crossesObstacle } from './routeOrthogonal'
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

  it('centers a 3-member group: the middle edge stays put, outers split by ±gap', () => {
    const mk = (y: number): Point[] => [
      { x: 0, y }, { x: 100, y }, { x: 100, y: y + 200 }, { x: 300, y: y + 200 },
    ]
    const out = spreadEdgeRoutes(
      [{ id: 'a', points: mk(0) }, { id: 'b', points: mk(40) }, { id: 'c', points: mk(80) }],
      12,
    )
    // sorted by id → a,b,c → offsets -12, 0, +12 around the shared x=100.
    expect(out.get('a')![1].x).toBe(88)
    expect(out.get('b')![1].x).toBe(100) // middle member unchanged
    expect(out.get('c')![1].x).toBe(112)
  })

  it('does NOT spread two segments that belong to the SAME bundle', () => {
    // Same coordinates as the spreading test, but a bundleKeyOf marks both as one
    // bundle → they must stay overlapping (the merged trunk is intentional).
    const a: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }]
    const b: Point[] = [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 250 }, { x: 300, y: 250 }]
    const out = spreadEdgeRoutes(
      [{ id: 'a', points: a }, { id: 'b', points: b }],
      12,
      () => 'same-bundle',
    )
    expect(out.get('a')![1].x).toBe(100) // unchanged — not fanned
    expect(out.get('b')![1].x).toBe(100)
  })

  it('keeps a same-bundle pair together even when an unrelated edge overlaps them', () => {
    // a + b are one bundle sharing an interior vertical trunk at x=100; c is a
    // DIFFERENT edge whose interior vertical coincidentally lands on x=100 too.
    // The union groups all three, but a & b (one bundle) must share a track — only
    // c splits off (the transitive-grouping bug a pairwise skip can't prevent).
    const a: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }]
    const b: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }]
    const c: Point[] = [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 250 }, { x: 300, y: 250 }]
    const out = spreadEdgeRoutes(
      [{ id: 'a', points: a }, { id: 'b', points: b }, { id: 'c', points: c }],
      12,
      (id) => (id === 'c' ? 'bundle-c' : 'bundle-ab'),
    )
    // a and b (same bundle) land on the SAME vertical track…
    expect(out.get('a')![1].x).toBe(out.get('b')![1].x)
    // …and c (the unrelated edge) is pushed onto a DIFFERENT one.
    expect(out.get('c')![1].x).not.toBe(out.get('a')![1].x)
  })

  it('still spreads segments in DIFFERENT bundles', () => {
    const a: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }]
    const b: Point[] = [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 250 }, { x: 300, y: 250 }]
    const out = spreadEdgeRoutes(
      [{ id: 'a', points: a }, { id: 'b', points: b }],
      12,
      (id) => (id === 'a' ? 'bundle-a' : 'bundle-b'),
    )
    expect(out.get('a')![1].x).not.toBe(out.get('b')![1].x)
  })

  it('pushes two NEAR (not exactly overlapping) parallel lines to the full gap', () => {
    // verticals at x=100 and x=110 — only 10 apart, gap=18 → too close → fanned
    // out to exactly 18 (centred on their mean x=105 → 96 and 114).
    const a: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }]
    const b: Point[] = [{ x: 0, y: 50 }, { x: 110, y: 50 }, { x: 110, y: 250 }, { x: 300, y: 250 }]
    const out = spreadEdgeRoutes([{ id: 'a', points: a }, { id: 'b', points: b }], 18)
    const ax = out.get('a')![1].x
    const bx = out.get('b')![1].x
    expect(Math.abs(ax - bx)).toBe(18)
    expect(isOrtho(out.get('a')!)).toBe(true)
  })

  it('leaves parallel lines already ≥ gap apart untouched', () => {
    // verticals at x=100 and x=120 — 20 apart ≥ gap=18 → no change.
    const a: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }]
    const b: Point[] = [{ x: 0, y: 50 }, { x: 120, y: 50 }, { x: 120, y: 250 }, { x: 300, y: 250 }]
    const out = spreadEdgeRoutes([{ id: 'a', points: a }, { id: 'b', points: b }], 18)
    expect(out.get('a')![1].x).toBe(100)
    expect(out.get('b')![1].x).toBe(120)
  })

  it('does NOT mutate the caller input arrays', () => {
    const a: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }]
    const b: Point[] = [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 250 }, { x: 300, y: 250 }]
    spreadEdgeRoutes([{ id: 'a', points: a }, { id: 'b', points: b }], 12)
    expect(a).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }])
    expect(b).toEqual([{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 250 }, { x: 300, y: 250 }])
  })

  it('transitively groups A–B and B–C even when A and C do not overlap', () => {
    // a:[0,200] b:[150,350] c:[300,500] on x=100 → a∩b, b∩c, but a∌c.
    // Union-find must still put all three in ONE group → three distinct tracks.
    const seg = (y0: number, y1: number): Point[] => [
      { x: 0, y: y0 }, { x: 100, y: y0 }, { x: 100, y: y1 }, { x: 300, y: y1 },
    ]
    const out = spreadEdgeRoutes(
      [{ id: 'a', points: seg(0, 200) }, { id: 'b', points: seg(150, 350) }, { id: 'c', points: seg(300, 500) }],
      12,
    )
    const xsAt = new Set([out.get('a')![1].x, out.get('b')![1].x, out.get('c')![1].x])
    expect(xsAt.size).toBe(3) // all three fanned onto distinct corridors
  })
})

describe('spreadEdgeRoutes obstacle awareness', () => {
  // 두 독립 엣지의 수직 INTERIOR 세그먼트가 x=100에 겹침(near-overlap) →
  // 평소엔 평행 트랙으로 벌어진다. 한쪽을 벌리면 카드를 침범하는 배치를 만든다.
  // gap=18 → tracks at x=91 and x=109 (centered on mean=100, ±9).
  const routes = [
    { id: 'a', points: [ { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 } ] },
    { id: 'b', points: [ { x: 0, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 210 }, { x: 300, y: 210 } ] },
  ]

  it('cancels a shift that would push a segment across a card', () => {
    // blocker1 interior x:(80,100) covers track x=91 (91 > 80 && 91 < 100).
    // blocker2 interior x:(100,120) covers track x=109 (109 > 100 && 109 < 120).
    // x=100 is outside both (100 < 100 false; 100 > 100 false).
    const blockers = [
      { x: 80, y: 50, width: 20, height: 100 },   // 왼쪽 트랙(x=91)을 막음
      { x: 100, y: 50, width: 20, height: 100 },  // 오른쪽 트랙(x=109)을 막음
    ]
    const out = spreadEdgeRoutes(routes, 18, undefined, blockers)
    for (const id of ['a', 'b']) {
      const pts = out.get(id)!
      // 두 트랙 모두 막혀 이동이 취소되므로 수직 세그먼트는 원래 x=100에 남는다.
      expect(pts[1].x).toBe(100)
      for (let i = 0; i < pts.length - 1; i++) {
        expect(crossesObstacle(pts[i], pts[i + 1], blockers)).toBe(false)
      }
    }
  })

  it('still spreads normally when obstacles is empty', () => {
    const out = spreadEdgeRoutes(routes, 18, undefined, [])
    const ax = out.get('a')![1].x
    const bx = out.get('b')![1].x
    expect(ax).not.toEqual(bx)
  })

  it('is identical to the no-arg call when obstacles is undefined', () => {
    const a = spreadEdgeRoutes(routes, 18)
    const b = spreadEdgeRoutes(routes, 18, undefined, undefined)
    expect(b.get('a')).toEqual(a.get('a'))
    expect(b.get('b')).toEqual(a.get('b'))
  })
})
