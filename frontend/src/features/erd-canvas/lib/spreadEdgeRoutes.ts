/**
 * PURE post-processing pass over a set of already-routed orthogonal polylines.
 *
 * Problem: two distinct edges can coincidentally share the same gutter — their
 * interior collinear segments land on the exact same grid line and visually
 * collapse into one line. This function spreads such overlapping INTERIOR
 * segments onto parallel tracks (offset perpendicular to the segment) so they
 * read as separate edges.
 *
 * Endpoint stub segments (the first and last segment of each polyline) are the
 * anchored connections to the node borders and are NEVER moved.
 *
 * No React, no imports beyond the local `Point` type. Deterministic, pure:
 * inputs are deep-copied and never mutated; a NEW map is returned.
 */
import { crossesObstacle, inflateRect, type Point, type Rect } from './routeOrthogonal'

/**
 * Minimum gap a spread shift must keep from any card. crossesObstacle uses a
 * strict-interior test, so without this a shift could be slid right up against
 * a card border (≈0px) — the "line hugging a table" artifact. We cancel a shift
 * that NEWLY brings a segment within CLEARANCE of a card (segments that were
 * already that close keep their freedom, mirroring the group-box rule).
 */
const CARD_CLEARANCE = 14

export interface EdgeRoute {
  id: string
  points: Point[]
}

/** An interior (non-stub) straight segment, in normalised form. */
interface Segment {
  id: string // owning edge id
  i: number // segment connects points[i] and points[i+1]
  orient: 'h' | 'v'
  fixed: number // the constant coordinate (x for vertical, y for horizontal)
  lo: number // range start along the moving axis
  hi: number // range end along the moving axis
}

/**
 * Spread overlapping INTERIOR collinear segments across edges onto parallel
 * tracks. Endpoint stub segments (index 0 and the last) are never moved.
 * Returns a NEW map id -> adjusted points; inputs are not mutated.
 */
export function spreadEdgeRoutes(
  routes: EdgeRoute[],
  gap = 12,
  bundleKeyOf?: (id: string) => string | null,
  obstacles: Rect[] = [],
  groupBoxes: Rect[] = [],
): Map<string, Point[]> {
  // 1. Deep-copy each route's points so we never mutate the caller's data.
  const copies = new Map<string, Point[]>()
  for (const r of routes) {
    copies.set(
      r.id,
      r.points.map((p) => ({ x: p.x, y: p.y })),
    )
  }

  // 2. Enumerate INTERIOR segments only. For a polyline points[0..n] there are
  //    n segments, indexed by i = 0 .. points.length-2 (segment i joins
  //    points[i] and points[i+1]). The FIRST (i=0) and LAST (i=points.length-2)
  //    are the anchored stubs and must be skipped. Interior segments are
  //    i in 1 .. points.length-3 inclusive. Skip degenerate zero-length ones.
  const segments: Segment[] = []
  for (const r of routes) {
    const pts = r.points
    for (let i = 1; i <= pts.length - 3; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      if (a.x === b.x && a.y === b.y) continue // degenerate
      if (a.x === b.x) {
        // vertical: fixed x, range over y
        segments.push({
          id: r.id,
          i,
          orient: 'v',
          fixed: a.x,
          lo: Math.min(a.y, b.y),
          hi: Math.max(a.y, b.y),
        })
      } else if (a.y === b.y) {
        // horizontal: fixed y, range over x
        segments.push({
          id: r.id,
          i,
          orient: 'h',
          fixed: a.y,
          lo: Math.min(a.x, b.x),
          hi: Math.max(a.x, b.x),
        })
      }
      // diagonal segments (non-orthogonal input) are ignored
    }
  }

  // 3. Group segments that are collinear (same orient), have OVERLAPPING ranges,
  //    come from DIFFERENT edges, and sit CLOSER THAN `gap` on the perpendicular
  //    axis. This is a NEAR-overlap test (not exact): two parallel lines that
  //    merely run too close — not just ones that land on the identical grid line —
  //    are pulled into one group and later fanned out to the full `gap`, so
  //    distinct lines always keep a clean minimum separation. Transitive grouping
  //    via union-find so a chain A–B–C lands in one group.
  const parent = segments.map((_, idx) => idx)
  const find = (x: number): number => {
    let root = x
    while (parent[root] !== root) root = parent[root]
    while (parent[x] !== root) {
      const next = parent[x]
      parent[x] = root
      x = next
    }
    return root
  }
  const union = (x: number, y: number) => {
    const rx = find(x)
    const ry = find(y)
    if (rx !== ry) parent[rx] = ry
  }

  for (let a = 0; a < segments.length; a++) {
    for (let b = a + 1; b < segments.length; b++) {
      const sa = segments[a]
      const sb = segments[b]
      if (sa.id === sb.id) continue // same edge never spreads against itself
      if (sa.orient !== sb.orient) continue
      // Near-overlap on the perpendicular axis: closer than a full gap (exact
      // coincidence is the |Δ|=0 case). Lines already ≥ gap apart are left alone.
      if (Math.abs(sa.fixed - sb.fixed) >= gap) continue
      // overlapping ranges: aLo < bHi && bLo < aHi (touching-only doesn't count)
      if (sa.lo < sb.hi && sb.lo < sa.hi) union(a, b)
    }
  }

  // Collect groups by root.
  const groups = new Map<number, number[]>()
  for (let idx = 0; idx < segments.length; idx++) {
    const root = find(idx)
    const arr = groups.get(root)
    if (arr) arr.push(idx)
    else groups.set(root, [idx])
  }

  // 4. For each cluster of too-close collinear segments: lay out one TRACK per
  //    distinct BUNDLE (not per segment), evenly spaced by `gap` and centred on
  //    the cluster's mean position. All segments sharing a bundle key collapse
  //    onto ONE track, so a same-PK bundle the merge pass put on one trunk is
  //    NEVER split apart — even when an unrelated edge transitively joins the
  //    cluster. Segments with a null key each get their own track. A cluster that
  //    resolves to a single track (all one bundle) is left untouched. Because
  //    members may start at DIFFERENT near coords, each is SHIFTED by
  //    (track − its own fixed) — not a uniform offset. Shifting moves BOTH the
  //    segment's vertices perpendicular; the perpendicular neighbours just change
  //    length, so the polyline stays orthogonal. Stubs are never in this set.
  for (const members of groups.values()) {
    if (members.length < 2) continue
    members.sort((m, n) => {
      const sm = segments[m]
      const sn = segments[n]
      if (sm.id !== sn.id) return sm.id < sn.id ? -1 : 1
      return sm.i - sn.i
    })
    // Map each member → a track slot, collapsing same-bundle members onto one.
    const slotOfBundle = new Map<string, number>()
    let nextSlot = 0
    const memberSlot = members.map((m) => {
      const key = bundleKeyOf ? bundleKeyOf(segments[m].id) : null
      if (key == null) return nextSlot++ // unbundled → its own track
      let slot = slotOfBundle.get(key)
      if (slot === undefined) {
        slot = nextSlot++
        slotOfBundle.set(key, slot)
      }
      return slot
    })
    const k = nextSlot
    if (k < 2) continue // one bundle only → nothing to fan apart

    // Each slot's representative position = mean `fixed` of its members. Order the
    // slots by it and centre the evenly-spaced tracks on the cluster mean, so the
    // fan stays put on average and members keep their relative left-to-right order.
    const slotSum = new Array<number>(k).fill(0)
    const slotCount = new Array<number>(k).fill(0)
    members.forEach((m, idx) => {
      slotSum[memberSlot[idx]] += segments[m].fixed
      slotCount[memberSlot[idx]] += 1
    })
    const slotPos = slotSum.map((s, i) => s / slotCount[i])
    const order = [...Array(k).keys()].sort((a, b) => slotPos[a] - slotPos[b] || a - b)
    const center = slotPos.reduce((s, v) => s + v, 0) / k
    const slotTrack = new Array<number>(k)
    order.forEach((slot, j) => {
      slotTrack[slot] = center + (j - (k - 1) / 2) * gap
    })

    // NOTE (accepted limitation): the obstacle check is PER-MEMBER. If one
    // member's target track is blocked but another's is free, only the blocked
    // one stays put, so the pair can end up < gap apart. Correct (never crosses
    // a card) but not maximally spread — fixing would need a cluster-wide retry.
    members.forEach((m, idx) => {
      const seg = segments[m]
      const delta = slotTrack[memberSlot[idx]] - seg.fixed
      if (delta === 0) return
      const pts = copies.get(seg.id)!
      // 이동 후보 좌표 계산 (pt0/pt1 = 세그먼트 양 끝점; a/b는 위 그룹화 루프의
      // 인덱스라 이름 충돌을 피한다).
      const orig0 = { x: pts[seg.i].x, y: pts[seg.i].y }
      const orig1 = { x: pts[seg.i + 1].x, y: pts[seg.i + 1].y }
      const pt0 = { x: orig0.x, y: orig0.y }
      const pt1 = { x: orig1.x, y: orig1.y }
      if (seg.orient === 'v') {
        pt0.x += delta
        pt1.x += delta
      } else {
        pt0.y += delta
        pt1.y += delta
      }
      // 이동한 세그먼트가 카드를 가로지르면 이동 취소(원좌표 유지).
      if (crossesObstacle(pt0, pt1, obstacles)) return
      // 이동이 세그먼트를 카드에 '새로' CARD_CLEARANCE 이내로 바짝 붙이면 취소한다
      // (경계만 안 넘으면 0px까지 허용하던 hugging 방지). 원래도 그만큼 가까웠던
      // 세그먼트는 새 위반이 아니므로 자유를 유지(그룹 박스 규칙과 동일).
      for (const card of obstacles) {
        const near = inflateRect(card, CARD_CLEARANCE)
        if (crossesObstacle(pt0, pt1, [near]) && !crossesObstacle(orig0, orig1, [near]))
          return
      }
      // 이동이 세그먼트를 '새로' 그룹 박스 안으로 밀어넣으면 취소한다. 원래도
      // 지나던 그룹(예: 끝점 그룹 안의 spine) 내 이동은 새 위반이 아니므로 허용.
      for (const gbox of groupBoxes) {
        if (
          crossesObstacle(pt0, pt1, [gbox]) &&
          !crossesObstacle(orig0, orig1, [gbox])
        )
          return
      }
      pts[seg.i] = pt0
      pts[seg.i + 1] = pt1
    })
  }

  // 5. Return the adjusted (copied) points.
  return copies
}
