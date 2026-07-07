/**
 * PURE orthogonal obstacle-avoiding edge router ("gutter routing"). Given the
 * edge's source/target connection points (on the node borders), the side each
 * leaves from, and the OTHER node rectangles as obstacles, it returns an
 * orthogonal polyline that travels in the gaps BETWEEN nodes (just outside their
 * margins) and never crosses a node interior.
 *
 * Method (the standard sparse-grid orthogonal router): candidate routing lines
 * are placed just outside every obstacle (±MARGIN) plus the endpoints' lines; A*
 * over the intersection grid (with a turn penalty to prefer few bends) finds the
 * shortest path whose segments avoid all obstacle interiors. The source/target
 * cards MAY be included in `obstacles` (the caller does this to stop routes from
 * tunnelling THROUGH an endpoint card to reach an anchor on its far side): the
 * step-out ports sit MARGIN outside the anchor, exactly on the inflated card
 * border, and crossesObstacle treats grazing a border as allowed (strict
 * interior test), so the stub segments still leave/enter the endpoint cards.
 *
 * sourceTrunkOffset pushes the source step-out perpendicular to the card (X) so
 * edges leaving the same handle fan onto parallel vertical trunks instead of
 * collapsing onto one — complementing the in-Y sourceLaneOffset.
 *
 * features layer: no imports beyond local types. PURE, deterministic.
 */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}
export interface Point {
  x: number
  y: number
}
export type Side = 'left' | 'right'

/** 장애물 선택용 최소 노드 형태(테스트 가능하도록 InternalNode에서 분리).
 *  buildObstacles(features/erd-canvas/ui)와 공유 장애물 셀렉터가 함께 쓴다. */
export interface ObstacleNode {
  id: string
  type?: string
  parentId?: string
  rect: Rect
}

const MARGIN = 16
const TURN_PENALTY = 12

/**
 * Half-size of the padding added around the source→target bounding box when
 * culling obstacles for A* (see the cull block in routeOrthogonal). Generous
 * on purpose: it must cover the largest sideways detour A* would make around an
 * in-region obstacle. Only obstacles intersecting the padded region are kept
 * (whole), so a too-small pad can only make a route graze a box that was culled
 * — never a crash. Widen it if that ever shows up.
 */
const CULL_PAD = 600

/**
 * Extra clearance kept between a corridor and a NON-endpoint TableGroup box,
 * ON TOP of the routing MARGIN. Group obstacles are inflated by this much so
 * routes (and bundle trunks) give a group a visible berth instead of hugging
 * its boundary. Used by buildObstacles (per-edge A*) and mergeBundleRoutes
 * (bundle approach trunk + crossing checks). Endpoint groups are never
 * inflated — entry into one's own group is unaffected.
 */
export const GROUP_CLEARANCE = 24

/** Grow a rect by `by` on every side. */
export function inflateRect(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by }
}
// Distance the edge steps straight OUT of a card before it may turn — the
// endpoint "stub". Decoupled from MARGIN (obstacle inflation) on purpose: a
// longer stub guarantees a visible plain line between the entity and the
// crow-foot marker (which itself spans ~14px), while routing gutters stay at
// MARGIN so tightly-placed cards still get a corridor between them. Lane/trunk
// offsets are added ON TOP of this base.
const STEP_OUT = 30

/** True if the axis-aligned segment a→b passes through any obstacle's interior. */
export function crossesObstacle(a: Point, b: Point, obstacles: Rect[]): boolean {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  for (const o of obstacles) {
    // Strict overlap with the interior — grazing an edge/margin line is allowed.
    if (maxX > o.x && minX < o.x + o.width && maxY > o.y && minY < o.y + o.height) {
      return true
    }
  }
  return false
}

/** Merge consecutive collinear points so the polyline has minimal vertices. */
function simplify(pts: Point[]): Point[] {
  if (pts.length <= 2) return pts
  const out: Point[] = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const collinear =
      (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)
    if (!collinear) out.push(b)
  }
  out.push(pts[pts.length - 1])
  return out
}

export function routeOrthogonal(
  source: Point,
  target: Point,
  sourceSide: Side,
  targetSide: Side,
  obstacles: Rect[],
  margin = MARGIN,
  targetLaneOffset = 0,
  sourceLaneOffset = 0,
  sourceTrunkOffset = 0,
): Point[] {
  // Step-out ports: leave/enter the node by STEP_OUT before turning (a generous
  // stub so the crow-foot has a visible plain line at the entity). The target
  // port is pushed an extra `targetLaneOffset` away from the node so edges that
  // reference DIFFERENT PKs enter on distinct vertical lanes instead of piling
  // onto one shared lane (same-PK edges share an offset → stay bundled).
  // sourceLaneOffset pushes the source port in Y with an L-stub so edges leaving
  // the same PK fan onto separate corridors. sourceTrunkOffset pushes the source
  // step-out perpendicular to the card (X) so edges leaving the same handle fan
  // onto parallel vertical trunks instead of collapsing onto one — complementing
  // the in-Y sourceLaneOffset. (Obstacle inflation still uses `margin`, NOT
  // STEP_OUT, so routing gutters between close cards are preserved.)
  const sMargin = STEP_OUT + sourceTrunkOffset
  const sPort: Point = {
    x: source.x + (sourceSide === 'right' ? sMargin : -sMargin),
    y: source.y + sourceLaneOffset,
  }
  const tMargin = STEP_OUT + targetLaneOffset
  const tPort: Point = {
    x: target.x + (targetSide === 'right' ? tMargin : -tMargin),
    y: target.y,
  }

  // Narrow facing gap: when the two anchors face each other (each step-out
  // points INTO the gap between them) across a gap smaller than their combined
  // step-outs, the ports cross and the stub collapses — the connector would
  // turn right next to a card. Pull both step-out ports to the gap midpoint so
  // each side keeps an equal stub (gap/2) and no segment hugs a table.
  const sSign = sourceSide === 'right' ? 1 : -1
  const tSign = targetSide === 'right' ? 1 : -1
  const dx = target.x - source.x
  const facing = dx !== 0 && Math.sign(dx) === sSign && Math.sign(-dx) === tSign
  if (facing && Math.abs(dx) <= sMargin + tMargin) {
    const mid = source.x + dx / 2
    sPort.x = mid
    tPort.x = mid
  }

  // Obstacle culling: only obstacles near the source→target region can shape the
  // route. Far-away cards/groups never lie on an optimal (length-minimising)
  // orthogonal path between these endpoints, so dropping them shrinks the
  // candidate grid from O(all nodes) to O(local nodes) — the difference between
  // ~490k grid nodes/edge and a few hundred on a 191-table sprawl. The region is
  // the endpoint+port bounding box padded by CULL_PAD; an obstacle is KEPT WHOLE
  // (never clipped) if it intersects the padded region, so its ±margin candidate
  // lines survive and routes around it are unchanged. The pad is generous enough
  // to cover the detour A* would take around an in-region obstacle; if a route
  // ever grazes a culled box, widening CULL_PAD restores it (mergeBundleRoutes'
  // per-member lineCrosses is the downstream safety net).
  const regionMinX = Math.min(source.x, target.x, sPort.x, tPort.x) - CULL_PAD
  const regionMaxX = Math.max(source.x, target.x, sPort.x, tPort.x) + CULL_PAD
  const regionMinY = Math.min(source.y, target.y, sPort.y, tPort.y) - CULL_PAD
  const regionMaxY = Math.max(source.y, target.y, sPort.y, tPort.y) + CULL_PAD
  const nearby = obstacles.filter(
    (o) =>
      o.x < regionMaxX &&
      o.x + o.width > regionMinX &&
      o.y < regionMaxY &&
      o.y + o.height > regionMinY,
  )

  // Candidate routing lines: just outside every nearby obstacle + the endpoints/ports.
  const xsSet = new Set<number>([source.x, target.x, sPort.x, tPort.x])
  const ysSet = new Set<number>([source.y, target.y, sPort.y, tPort.y])
  for (const o of nearby) {
    xsSet.add(o.x - margin)
    xsSet.add(o.x + o.width + margin)
    ysSet.add(o.y - margin)
    ysSet.add(o.y + o.height + margin)
  }
  const xs = [...xsSet].sort((a, b) => a - b)
  const ys = [...ysSet].sort((a, b) => a - b)
  const xi = new Map(xs.map((v, i) => [v, i]))
  const yi = new Map(ys.map((v, i) => [v, i]))

  const pt = (a: number, b: number): Point => ({ x: xs[a], y: ys[b] })
  const k = (a: number, b: number): string => `${a},${b}`

  const startXi = xi.get(sPort.x) as number
  const startYi = yi.get(sPort.y) as number
  const goalXi = xi.get(tPort.x) as number
  const goalYi = yi.get(tPort.y) as number
  const startKey = k(startXi, startYi)
  const goalKey = k(goalXi, goalYi)

  const heur = (a: number, b: number): number =>
    Math.abs(xs[a] - tPort.x) + Math.abs(ys[b] - tPort.y)

  // A* over the intersection grid. The open set is a binary min-heap ordered by
  // (f, seq): the earlier-inserted node wins ties, matching the previous
  // linear-scan "first minimum" pick — so the chosen path is UNCHANGED, only the
  // per-pop cost drops from O(open) to O(log open). On a large grid the old
  // linear scan made the whole A* O(nodes^2); the heap makes it O(nodes log n).
  const g = new Map<string, number>([[startKey, 0]])
  const arriveDir = new Map<string, 'h' | 'v' | null>([[startKey, null]])
  const came = new Map<string, string>()
  type OpenItem = { key: string; a: number; b: number; f: number; seq: number }
  const heap: OpenItem[] = []
  let seq = 0
  const less = (i: number, j: number): boolean =>
    heap[i].f < heap[j].f || (heap[i].f === heap[j].f && heap[i].seq < heap[j].seq)
  const swap = (i: number, j: number): void => {
    const t = heap[i]
    heap[i] = heap[j]
    heap[j] = t
  }
  const pushOpen = (it: OpenItem): void => {
    heap.push(it)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (less(i, p)) swap(i, (i = p))
      else break
    }
  }
  const popOpen = (): OpenItem => {
    const top = heap[0]
    const last = heap.pop() as OpenItem
    if (heap.length > 0) {
      heap[0] = last
      let i = 0
      const n = heap.length
      for (;;) {
        const l = 2 * i + 1
        const r = 2 * i + 2
        let m = i
        if (l < n && less(l, m)) m = l
        if (r < n && less(r, m)) m = r
        if (m === i) break
        swap(i, (i = m))
      }
    }
    return top
  }
  pushOpen({ key: startKey, a: startXi, b: startYi, f: heur(startXi, startYi), seq: seq++ })
  const closed = new Set<string>()

  while (heap.length > 0) {
    const cur = popOpen()
    if (cur.key === goalKey) break
    if (closed.has(cur.key)) continue
    closed.add(cur.key)
    const cg = g.get(cur.key) as number
    const cd = arriveDir.get(cur.key) ?? null
    const neighbors: Array<[number, number, 'h' | 'v']> = [
      [cur.a - 1, cur.b, 'h'],
      [cur.a + 1, cur.b, 'h'],
      [cur.a, cur.b - 1, 'v'],
      [cur.a, cur.b + 1, 'v'],
    ]
    for (const [na, nb, nd] of neighbors) {
      if (na < 0 || na >= xs.length || nb < 0 || nb >= ys.length) continue
      const from = pt(cur.a, cur.b)
      const to = pt(na, nb)
      if (crossesObstacle(from, to, nearby)) continue
      const step = Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
      const turn = cd && cd !== nd ? TURN_PENALTY : 0
      const ng = cg + step + turn
      const nk = k(na, nb)
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng)
        came.set(nk, cur.key)
        arriveDir.set(nk, nd)
        pushOpen({ key: nk, a: na, b: nb, f: ng + heur(na, nb), seq: seq++ })
      }
    }
  }

  // No route found. The lane/trunk offsets push the step-out ports AWAY from
  // the anchors; in a dense layout a large offset can drop a port INSIDE a
  // neighbouring obstacle, boxing in the A* start so no route exists at all.
  // Before giving up to the obstacle-CROSSING L/Z, retry once with the offsets
  // zeroed — the ports then sit at the plain STEP_OUT, clear of neighbours, and
  // a clean obstacle-avoiding route almost always exists. We trade the cosmetic
  // lane fan for a route that doesn't tunnel through cards/groups.
  if (startKey !== goalKey && !came.has(goalKey)) {
    if (sourceLaneOffset !== 0 || sourceTrunkOffset !== 0 || targetLaneOffset !== 0) {
      return routeOrthogonal(source, target, sourceSide, targetSide, obstacles, margin)
    }
    return simplify([
      source,
      { x: sPort.x, y: source.y },
      sPort,
      { x: tPort.x, y: sPort.y },
      tPort,
      target,
    ])
  }

  const path: Point[] = []
  let key = goalKey
  for (;;) {
    const [a, b] = key.split(',').map(Number)
    path.unshift(pt(a, b))
    if (key === startKey) break
    key = came.get(key) as string
  }

  // L-stub at the source: step out horizontally on the anchor row, then jog
  // vertically to the lane corridor. When sourceLaneOffset is 0 the corner
  // equals sPort and simplify() drops it, so the straight case is unchanged.
  const sourceCorner: Point = { x: sPort.x, y: source.y }
  return simplify([source, sourceCorner, ...path, target])
}

/** Build the SVG path `d` string for an orthogonal polyline. */
export function polylineToPath(points: Point[]): string {
  if (points.length === 0) return ''
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')
}
