import { describe, it, expect } from 'vitest'
import { mergeBundleRoutes } from './mergeBundleRoutes'
import type { Point } from './routeOrthogonal'

const isOrtho = (pts: Point[]) =>
  pts.every((p, i) => i === 0 || p.x === pts[i - 1].x || p.y === pts[i - 1].y)

// Two FK edges from the SAME PK (source point shared) into the SAME target card
// edge (x=501), at different rows — the canonical bundle.
const created: Point[] = [
  { x: 239, y: 55 }, { x: 471, y: 55 }, { x: 471, y: 82 }, { x: 501, y: 82 },
]
const updated: Point[] = [
  { x: 239, y: 55 }, { x: 283, y: 55 }, { x: 283, y: 110 }, { x: 501, y: 110 },
]
const SAME = () => 'service|account.id'

describe('mergeBundleRoutes', () => {
  it('merges a same-PK bundle onto one shared trunk that forks to each row', () => {
    const out = mergeBundleRoutes(
      [{ id: 'created', points: created }, { id: 'updated', points: updated }],
      SAME,
    )
    const a = out.get('created')!
    const b = out.get('updated')!
    // Both keep the shared source anchor and reach their OWN target row.
    expect(a[0]).toEqual({ x: 239, y: 55 })
    expect(b[0]).toEqual({ x: 239, y: 55 })
    expect(a[a.length - 1]).toEqual({ x: 501, y: 82 })
    expect(b[b.length - 1]).toEqual({ x: 501, y: 110 })
    // The trunk vertical is the SAME x for both (the card-hugging one, x=471).
    const aTrunk = a[a.length - 2].x
    const bTrunk = b[b.length - 2].x
    expect(aTrunk).toBe(471)
    expect(bTrunk).toBe(471)
    // The pre-fork prefix is identical (one visible line until the fork).
    expect(a[0]).toEqual(b[0])
    expect(a[1]).toEqual(b[1]) // (471,55) — the trunk entry, shared
    expect(isOrtho(a)).toBe(true)
    expect(isOrtho(b)).toBe(true)
  })

  it('picks the card-hugging trunk as the representative (snaps the far member in)', () => {
    // updated's natural trunk is x=283 (far from card); both must end on x=471.
    const out = mergeBundleRoutes(
      [{ id: 'created', points: created }, { id: 'updated', points: updated }],
      SAME,
    )
    expect(out.get('updated')!.some((p) => p.x === 283)).toBe(false)
  })

  it('bundles same-PK edges to DIFFERENT tables/x onto one cross-canvas trunk', () => {
    // a → a target at x=500 row 50; b → a DIFFERENT table at x=600 row 150. Same
    // PK, same side → ONE trunk just left of the nearest target (500−30=470), each
    // forking into its own row. The trunk spans tables (a same-PK "bus").
    const a: Point[] = [{ x: 0, y: 0 }, { x: 470, y: 0 }, { x: 470, y: 50 }, { x: 500, y: 50 }]
    const b: Point[] = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 150 }, { x: 600, y: 150 }]
    const out = mergeBundleRoutes([{ id: 'a', points: a }, { id: 'b', points: b }], () => 'pk|L')
    const oa = out.get('a')!
    const ob = out.get('b')!
    expect(oa[1]).toEqual({ x: 470, y: 0 }) // shared trunk entry, both members
    expect(ob[1]).toEqual({ x: 470, y: 0 })
    expect(oa[oa.length - 2].x).toBe(470) // trunk x identical…
    expect(ob[ob.length - 2].x).toBe(470)
    expect(oa[oa.length - 1]).toEqual({ x: 500, y: 50 }) // …forking to each own target
    expect(ob[ob.length - 1]).toEqual({ x: 600, y: 150 })
  })

  it('leaves a single-member bundle untouched', () => {
    const out = mergeBundleRoutes([{ id: 'created', points: created }], SAME)
    expect(out.get('created')).toEqual(created)
  })

  it('leaves edges in DIFFERENT bundles untouched', () => {
    const other: Point[] = [
      { x: 239, y: 255 }, { x: 269, y: 255 }, { x: 269, y: 139 }, { x: 501, y: 139 },
    ]
    const keyOf = (id: string) => (id === 'other' ? 'service|publishing.id' : 'service|account.id')
    const out = mergeBundleRoutes(
      [{ id: 'created', points: created }, { id: 'updated', points: updated }, { id: 'other', points: other }],
      keyOf,
    )
    expect(out.get('other')).toEqual(other)
  })

  it('skips merge (safety) when members do not share a source point', () => {
    const moved: Point[] = [
      { x: 999, y: 55 }, { x: 283, y: 55 }, { x: 283, y: 110 }, { x: 501, y: 110 },
    ]
    const out = mergeBundleRoutes(
      [{ id: 'created', points: created }, { id: 'moved', points: moved }],
      SAME,
    )
    expect(out.get('created')).toEqual(created)
    expect(out.get('moved')).toEqual(moved)
  })

  it('ignores edges with a null bundle key', () => {
    const out = mergeBundleRoutes(
      [{ id: 'created', points: created }, { id: 'updated', points: updated }],
      () => null,
    )
    expect(out.get('created')).toEqual(created)
    expect(out.get('updated')).toEqual(updated)
  })

  it('does NOT mutate the caller input arrays', () => {
    const a = created.map((p) => ({ ...p }))
    const b = updated.map((p) => ({ ...p }))
    mergeBundleRoutes([{ id: 'created', points: a }, { id: 'updated', points: b }], SAME)
    expect(a).toEqual(created)
    expect(b).toEqual(updated)
  })
})

describe('mergeBundleRoutes obstacle awareness', () => {
  // 같은 PK(=같은 bundle) 2개 멤버.
  // side='left': targets at x=200, so trunkX = 200 - 30 = 170.
  // The merged trunk is a vertical segment at x=170 from y=0 to y=300.
  // blocker covers x=[150,210], y=[100,220] — the trunk at x=170 runs right through it.
  const keyOf = () => 'pk|L'
  const routes = [
    { id: 'a', points: [ { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 }, { x: 200, y: 10 } ] },
    { id: 'b', points: [ { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 300 }, { x: 200, y: 300 } ] },
  ]

  it('falls back to the raw routes when the trunk would cross a card', () => {
    // trunkX=170 and the y-span 0..300 passes through the blocker's interior.
    const blocker = { x: 150, y: 100, width: 60, height: 120 }
    const out = mergeBundleRoutes(routes, keyOf, [blocker])
    expect(out.get('a')).toEqual(routes[0].points)
    expect(out.get('b')).toEqual(routes[1].points)
  })

  it('still merges when no obstacle blocks the trunk (obstacles=[])', () => {
    const out = mergeBundleRoutes(routes, keyOf, [])
    expect(out.get('a')).not.toEqual(routes[0].points)
  })

  it('is byte-identical to the no-arg call when obstacles is undefined', () => {
    const withUndef = mergeBundleRoutes(routes, keyOf)
    const out = mergeBundleRoutes(routes, keyOf, undefined)
    expect(out.get('a')).toEqual(withUndef.get('a'))
    expect(out.get('b')).toEqual(withUndef.get('b'))
  })
})
