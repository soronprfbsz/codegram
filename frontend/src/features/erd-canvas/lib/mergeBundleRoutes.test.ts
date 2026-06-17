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

  // Regression: the bundle's OWN endpoint cards (source PK card + each target FK
  // card) must NOT count as crossings. The trunk's leave/fork legitimately start
  // and end at those cards' borders, and the anchor can sit a few px inside the
  // card box (React Flow handles / measured width), so a strict-interior test
  // produces a FALSE crossing and wrongly cancels the bus. Only an UNRELATED
  // intervening card should trigger fallback.
  describe('endpoint cards do not count as crossings', () => {
    const keyL = () => 'pk|L'
    // src anchor (240,30) sits 2px inside the source card's right edge (x→242);
    // target anchors (700,*) sit 2px inside the target cards' left edge (x:698→).
    const busRoutes = [
      { id: 'a', points: [ { x: 240, y: 30 }, { x: 280, y: 30 }, { x: 280, y: 30 }, { x: 700, y: 30 } ] },
      { id: 'b', points: [ { x: 240, y: 30 }, { x: 280, y: 30 }, { x: 280, y: 230 }, { x: 700, y: 230 } ] },
    ]
    const endpointCards = [
      { x: 0, y: 0, width: 242, height: 66 },     // source card (anchor 240 inside)
      { x: 698, y: 0, width: 242, height: 66 },    // target card a (anchor 700 inside)
      { x: 698, y: 200, width: 242, height: 66 },  // target card b
    ]

    it('still merges the bus when the trunk only grazes its own endpoint cards', () => {
      const out = mergeBundleRoutes(busRoutes, keyL, endpointCards)
      // Bus formed → both members share the trunk x=670 (min target 700 - 30).
      const trunkXOf = (pts: { x: number; y: number }[]) => {
        let best = { x: NaN, len: -1 }
        for (let i = 0; i + 1 < pts.length; i++) {
          if (pts[i].x === pts[i + 1].x) {
            const len = Math.abs(pts[i + 1].y - pts[i].y)
            if (len > best.len) best = { x: pts[i].x, len }
          }
        }
        return best.x
      }
      // member b has a real vertical trunk segment; it must hug the column (x=670).
      expect(trunkXOf(out.get('b')!)).toBe(670)
      // and member a was rewritten onto the same trunk (not its raw route).
      expect(out.get('a')).not.toEqual(busRoutes[0].points)
    })

    it('still falls back when an UNRELATED intervening card blocks the trunk', () => {
      // A card sitting on the vertical trunk corridor (x=670) between the rows —
      // not an endpoint card — must still cancel the bus.
      const intervening = { x: 660, y: 60, width: 40, height: 120 }
      const out = mergeBundleRoutes(busRoutes, keyL, [...endpointCards, intervening])
      expect(out.get('a')).toEqual(busRoutes[0].points)
      expect(out.get('b')).toEqual(busRoutes[1].points)
    })
  })

  // Regression (the real-app bug): a per-segment grazing rule, NOT a bundle-wide
  // one. A far cluster's shared horizontal LEAVE can tunnel through a NEARER
  // bundle member's target card (a different cluster). That card holds another
  // member's anchor, so a bundle-wide endpoint exclusion would wrongly ignore it
  // and let the bus cross. The crossing must be detected → the far cluster falls
  // back to its raw routes.
  describe('per-segment grazing: leave tunneling through a sibling member card', () => {
    const keyL = () => 'pk|L'
    const src = { x: 0, y: 100 }
    // Far cluster P+R (targets at x=1000 → one cluster, trunkX=970).
    // Near member C (target at x=400 → its own cluster).
    const routes = [
      { id: 'P', points: [src, { x: 30, y: 100 }, { x: 30, y: 50 }, { x: 1000, y: 50 }] },
      { id: 'R', points: [src, { x: 30, y: 100 }, { x: 30, y: 300 }, { x: 1000, y: 300 }] },
      { id: 'C', points: [src, { x: 30, y: 100 }, { x: 30, y: 100 }, { x: 400, y: 100 }] },
    ]
    // customer_note-like card holding member C's target (400,100); the P/R leave
    // at y=100 from x=0→970 tunnels straight through it.
    const siblingCard = { x: 380, y: 60, width: 240, height: 80 }

    it("detects the leave crossing a sibling member's card and falls back", () => {
      const out = mergeBundleRoutes(routes, keyL, [siblingCard])
      // P and R must NOT be merged onto a bus that tunnels through the card.
      expect(out.get('P')).toEqual(routes[0].points)
      expect(out.get('R')).toEqual(routes[1].points)
    })

    it('merges P+R when the sibling card is out of the leave path', () => {
      // Same bundle, but the sibling card sits BELOW the y=100 leave row → no cross.
      const lowCard = { x: 380, y: 400, width: 240, height: 80 }
      const out = mergeBundleRoutes(routes, keyL, [lowCard])
      expect(out.get('P')).not.toEqual(routes[0].points) // bussed
    })
  })

  // The 2-level "spine bus" for targets INSIDE a group box: descend the group's
  // entry gutter, run a horizontal spine ABOVE the target row, then fork DOWN each
  // interior column's gutter into the FK. The OUTERMOST column connects straight
  // from the entry gutter (no spine detour).
  describe('intra-group spine bus', () => {
    const keyL = () => 'pk|L'
    const src = { x: 719, y: 376 }
    // Two top-row tables in one group: customer (col0) and project (col1).
    const customerCard = { x: 1012, y: 78, width: 240, height: 126 }
    const projectCard = { x: 1372, y: 78, width: 240, height: 98 }
    const groupBox = { x: 1000, y: 40, width: 800, height: 400 }
    // FK anchors on each table's LEFT border (left-approach), at a mid row.
    const routes = [
      { id: 'customer', points: [src, { x: 749, y: 376 }, { x: 749, y: 160 }, { x: 1013, y: 160 }] },
      { id: 'project', points: [src, { x: 749, y: 376 }, { x: 749, y: 161 }, { x: 1373, y: 161 }] },
    ]
    const obstacles = [customerCard, projectCard]

    it('outermost column enters straight; interior column rides the spine and forks down', () => {
      const out = mergeBundleRoutes(routes, keyL, obstacles, [groupBox])
      const descentX = 1013 - 30 // 983 (just left of the leftmost target)
      const spineY = 78 - 40 // 38 (above the topmost target table)

      // customer (col0 == descent gutter): plain vertical approach, NO spine band.
      expect(out.get('customer')).toEqual([
        { x: 719, y: 376 },
        { x: descentX, y: 376 },
        { x: descentX, y: 160 },
        { x: 1013, y: 160 },
      ])

      // project (interior col1): descend gutter → spine across → fork down col gutter.
      const gx = 1373 - 30 // 1343 (project's left gutter)
      expect(out.get('project')).toEqual([
        { x: 719, y: 376 },
        { x: descentX, y: 376 },
        { x: descentX, y: spineY },
        { x: gx, y: spineY },
        { x: gx, y: 161 },
        { x: 1373, y: 161 },
      ])
      // The two share the descent gutter prefix (one visible line entering the group).
      expect(out.get('customer')![1]).toEqual(out.get('project')![1])
    })

    it('falls back (no groups passed) to the legacy cross-canvas trunk', () => {
      // Without group boxes, the same targets are "loose" → single vertical trunk.
      const out = mergeBundleRoutes(routes, keyL, obstacles)
      // project's penultimate point is the shared trunk x (983), not a spine.
      expect(out.get('project')!.some((p) => p.y === 38)).toBe(false)
    })
  })

  // 모델 1: 직선 하강(descentX 수직)이 중간(비-끝점) 그룹을 관통하는 경우, A*로
  // 클러스터당 1개 공유 진입 trunk를 만들어 우회한다. 깨끗하면 직선 유지(기존 동작).
  describe('intra-group spine bus: A* 진입 trunk로 중간 그룹 우회', () => {
    const keyL = () => 'pk|L'
    const src = { x: 0, y: 0 } // 위쪽 소스, 오른쪽으로 leave
    // 목적지 그룹(아래): 안에 2개 타깃(col0, 내부 col1).
    const destGroup = { x: 1000, y: 1000, width: 600, height: 400 }
    const colA = { x: 1012, y: 1040, width: 240, height: 120 } // 타깃 카드 a
    const colB = { x: 1372, y: 1040, width: 240, height: 100 } // 타깃 카드 b(내부 컬럼)
    // 중간(비-끝점) 그룹: 직선 하강 x=983(=1013-30), y 0..1000 을 가로막는다.
    const midGroup = { x: 900, y: 400, width: 400, height: 300 } // x900..1300, y400..700
    const routes = [
      { id: 'a', points: [src, { x: 30, y: 0 }, { x: 30, y: 1100 }, { x: 1013, y: 1100 }] },
      { id: 'b', points: [src, { x: 30, y: 0 }, { x: 30, y: 1100 }, { x: 1373, y: 1100 }] },
    ]
    const obstacles = [colA, colB]
    const groupBoxes = [destGroup, midGroup]

    const isOrtho2 = (pts: Point[]) =>
      pts.every((p, i) => i === 0 || p.x === pts[i - 1].x || p.y === pts[i - 1].y)
    // line의 어떤 세그먼트도 box 내부(strict)를 가로지르지 않는가.
    const crossesBox = (line: Point[], box: { x: number; y: number; width: number; height: number }) => {
      for (let i = 0; i + 1 < line.length; i++) {
        const minX = Math.min(line[i].x, line[i + 1].x), maxX = Math.max(line[i].x, line[i + 1].x)
        const minY = Math.min(line[i].y, line[i + 1].y), maxY = Math.max(line[i].y, line[i + 1].y)
        if (maxX > box.x && minX < box.x + box.width && maxY > box.y && minY < box.y + box.height) return true
      }
      return false
    }

    it('중간 그룹을 가로지르는 직선 하강을 A* 진입 trunk로 우회시키고, 공유 prefix로 합류', () => {
      const out = mergeBundleRoutes(routes, keyL, obstacles, groupBoxes)
      const a = out.get('a')!
      const b = out.get('b')!
      // 1) 두 멤버 모두 raw 경로가 아니라 재작성됨(번들 형성).
      expect(a).not.toEqual(routes[0].points)
      expect(b).not.toEqual(routes[1].points)
      // 2) 각자 자기 타깃에 도달.
      expect(a[a.length - 1]).toEqual({ x: 1013, y: 1100 })
      expect(b[b.length - 1]).toEqual({ x: 1373, y: 1100 })
      // 3) 직교 유지.
      expect(isOrtho2(a)).toBe(true)
      expect(isOrtho2(b)).toBe(true)
      // 4) 어떤 멤버도 중간 그룹·타깃 카드 내부를 가로지르지 않음(핵심).
      expect(crossesBox(a, midGroup)).toBe(false)
      expect(crossesBox(b, midGroup)).toBe(false)
      expect(crossesBox(a, colB)).toBe(false) // a는 colB를 안 건드림
      expect(crossesBox(b, colA)).toBe(false) // b는 colA를 안 건드림
      // 5) 진입 trunk 공유(소스 부채꼴 아님): 두 멤버가 소스에서 같은 첫 세그먼트로
      //    떠나 우회 trunk를 공유한다. outermost 컬럼(gx=descentX)은 entry 정점이
      //    spine로 collapse되고 A*가 entry에 수평 도달하면 그 정점이 simplify로
      //    병합될 수 있어, 정확 정점 비교 대신 공통 prefix 길이로 검증한다.
      let lcp = 0
      while (lcp < a.length && lcp < b.length && a[lcp].x === b[lcp].x && a[lcp].y === b[lcp].y) lcp++
      expect(a[0]).toEqual(src)
      expect(lcp).toBeGreaterThanOrEqual(2) // src + 공유 leave 정점 → 부채꼴이 아님
    })

    it('직선 하강이 깨끗하면(중간 그룹 없음) A* 없이 기존 spine 직선 진입 유지', () => {
      // midGroup 제거 → 직선 하강 x=983, y0..1000 이 막히지 않음.
      const out = mergeBundleRoutes(routes, keyL, obstacles, [destGroup])
      const a = out.get('a')!
      // 기존 직선 진입: src → (983,0) → (983,1000) → … 의 첫 꺾임이 (983,0).
      expect(a[1]).toEqual({ x: 983, y: 0 })
    })
  })
})
