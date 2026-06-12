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

const MARGIN = 16
const TURN_PENALTY = 12

/** True if the axis-aligned segment a→b passes through any obstacle's interior. */
function crossesObstacle(a: Point, b: Point, obstacles: Rect[]): boolean {
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
): Point[] {
  // Step-out ports: leave/enter the node by `margin` before turning. The target
  // port is pushed an extra `targetLaneOffset` away from the node so edges that
  // reference DIFFERENT PKs enter on distinct vertical lanes instead of piling
  // onto one shared lane (same-PK edges share an offset → stay bundled).
  // sourceLaneOffset pushes the source port in Y with an L-stub so edges leaving
  // the same PK fan onto separate corridors.
  const sPort: Point = {
    x: source.x + (sourceSide === 'right' ? margin : -margin),
    y: source.y + sourceLaneOffset,
  }
  const tMargin = margin + targetLaneOffset
  const tPort: Point = {
    x: target.x + (targetSide === 'right' ? tMargin : -tMargin),
    y: target.y,
  }

  // Candidate routing lines: just outside every obstacle + the endpoints/ports.
  const xsSet = new Set<number>([source.x, target.x, sPort.x, tPort.x])
  const ysSet = new Set<number>([source.y, target.y, sPort.y, tPort.y])
  for (const o of obstacles) {
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

  // A* (array-based PQ — graphs are small: O(nodes^2) intersections).
  const g = new Map<string, number>([[startKey, 0]])
  const arriveDir = new Map<string, 'h' | 'v' | null>([[startKey, null]])
  const came = new Map<string, string>()
  const open: Array<{ key: string; a: number; b: number; f: number }> = [
    { key: startKey, a: startXi, b: startYi, f: heur(startXi, startYi) },
  ]
  const closed = new Set<string>()

  while (open.length > 0) {
    let mi = 0
    for (let i = 1; i < open.length; i++) if (open[i].f < open[mi].f) mi = i
    const cur = open.splice(mi, 1)[0]
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
      if (crossesObstacle(from, to, obstacles)) continue
      const step = Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
      const turn = cd && cd !== nd ? TURN_PENALTY : 0
      const ng = cg + step + turn
      const nk = k(na, nb)
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng)
        came.set(nk, cur.key)
        arriveDir.set(nk, nd)
        open.push({ key: nk, a: na, b: nb, f: ng + heur(na, nb) })
      }
    }
  }

  // No route found → simple L/Z fallback through the ports.
  if (startKey !== goalKey && !came.has(goalKey)) {
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
