/**
 * PURE post-processing pass that BUNDLES same-referenced-PK edges onto one trunk.
 *
 * Rule (reporter's request): every FK edge leaving the SAME PK toward the same
 * side should read as ONE line — a single trunk that travels across the canvas
 * and only forks (a short stub) into each target's row NEAR the targets — instead
 * of fanning into many parallel lines right at the source. Because every edge is
 * routed INDEPENDENTLY (per-edge A*), same-PK members otherwise pick different
 * trunks and scatter. This pass rewrites each bundle onto one trunk placed just
 * outside the nearest target card, so the shared run is long and the forks short.
 * (The target tables may differ — a same-PK "bus" spans tables.)
 *
 * A "bundle" = the routes that `bundleKeyOf` maps to the same non-null key. The
 * caller keys by `${referencedPK}|${side}` (side = L/R approach). Manual-waypoint
 * and enum edges are never registered as auto-routes, so they never reach here.
 *
 * Trunk geometry assumes the side-handle shape (horizontal leave from the PK,
 * vertical trunk, horizontal fork into each target). Bundles whose geometry does
 * not fit (mixed sides, a back-doubling target, a non-horizontal leave) are left
 * exactly as routed — never made worse.
 *
 * No React, no imports beyond the local `Point`/`EdgeRoute` types. Deterministic
 * and pure: inputs are deep-copied and never mutated; a NEW map is returned.
 */
import { crossesObstacle, type Rect, type Point } from './routeOrthogonal'
import type { EdgeRoute } from './spreadEdgeRoutes'

/** Length of the plain stub forked into each target — mirrors routeOrthogonal STEP_OUT. */
const APPROACH_STUB = 30

/**
 * Max target-x gap (≈ one card width) within a single trunk cluster. Targets
 * farther apart than this belong to different columns/table-groups and each get
 * their own trunk, so branches stay short and never cross the intervening cards.
 */
const CLUSTER_GAP = 240

/** Merge consecutive duplicate / collinear points so the polyline is minimal. */
function simplify(pts: Point[]): Point[] {
  if (pts.length <= 2) return pts
  const out: Point[] = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1]
    const b = pts[i]
    const c = pts[i + 1]
    if (a.x === b.x && a.y === b.y) continue // exact duplicate
    const collinear =
      (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)
    if (!collinear) out.push(b)
  }
  const last = pts[pts.length - 1]
  const prev = out[out.length - 1]
  if (!(prev.x === last.x && prev.y === last.y)) out.push(last)
  return out
}

/**
 * Rewrite each same-PK bundle's members onto one shared trunk that forks per row.
 * Returns a NEW map id -> adjusted points; inputs are not mutated. Routes with a
 * null bundle key, or bundles of size < 2, are copied through unchanged.
 */
export function mergeBundleRoutes(
  routes: EdgeRoute[],
  bundleKeyOf: (id: string) => string | null,
  obstacles: Rect[] = [],
): Map<string, Point[]> {
  // Deep-copy so callers' data is never mutated.
  const copies = new Map<string, Point[]>()
  for (const r of routes) {
    copies.set(
      r.id,
      r.points.map((p) => ({ x: p.x, y: p.y })),
    )
  }

  // Group route ids by bundle key (skip null keys + degenerate <2-point routes).
  const groups = new Map<string, string[]>()
  for (const r of routes) {
    if (r.points.length < 2) continue
    const key = bundleKeyOf(r.id)
    if (key == null) continue
    const arr = groups.get(key)
    if (arr) arr.push(r.id)
    else groups.set(key, [r.id])
  }

  for (const ids of groups.values()) {
    if (ids.length < 2) continue
    const members = ids.map((id) => ({ id, pts: copies.get(id)! }))

    // A bundle leaves ONE PK (shared source anchor) and leaves it in ONE
    // horizontal direction. Each member's TARGET (last point) may live in a
    // different table/row; the per-member stub direction (target.x vs the point
    // before it) tells the approach side. If the geometry isn't this clean
    // side-handle shape, skip — never emit a worse path than the per-edge route.
    const src = members[0].pts[0]
    const sideOf = (pts: Point[]): 'left' | 'right' | null => {
      const t = pts[pts.length - 1]
      const p = pts[pts.length - 2]
      if (t.x > p.x) return 'left' // stub runs rightward → enters a LEFT handle
      if (t.x < p.x) return 'right'
      return null
    }
    const side = sideOf(members[0].pts)
    const leaveSign = Math.sign(members[0].pts[1].x - members[0].pts[0].x)
    const ok =
      side != null &&
      leaveSign !== 0 &&
      members.every((m) => {
        const s = m.pts[0]
        return (
          s.x === src.x &&
          s.y === src.y &&
          sideOf(m.pts) === side &&
          Math.sign(m.pts[1].x - m.pts[0].x) === leaveSign
        )
      })
    if (!ok) continue

    // Split the bundle into CLUSTERS by target x-proximity: targets in one column
    // /table-group share a trunk, but a far-away group gets its OWN trunk — else a
    // single trunk near the leftmost target would force long branches that cross
    // the intervening cards. Single-linkage on the sorted target x with a
    // CLUSTER_GAP threshold (≈ one card width).
    const byTx = [...members].sort(
      (a, b) => a.pts[a.pts.length - 1].x - b.pts[b.pts.length - 1].x,
    )
    const clusters: (typeof members)[] = []
    for (const m of byTx) {
      const tx = m.pts[m.pts.length - 1].x
      const last = clusters[clusters.length - 1]
      const lastTx = last ? last[last.length - 1].pts[last[last.length - 1].pts.length - 1].x : 0
      if (last && tx - lastTx <= CLUSTER_GAP) last.push(m)
      else clusters.push([m])
    }

    for (const cluster of clusters) {
      if (cluster.length < 2) continue // a lone target keeps its own A* route

      // ONE shared trunk hugging this cluster: a vertical line just OUTSIDE its
      // nearest target card, so members share the long run and only fork (a short
      // horizontal) into each row near the targets. (APPROACH_STUB mirrors
      // routeOrthogonal's STEP_OUT so the crow-foot keeps a visible plain stub.)
      const txs = cluster.map((m) => m.pts[m.pts.length - 1].x)
      const trunkX =
        side === 'left' ? Math.min(...txs) - APPROACH_STUB : Math.max(...txs) + APPROACH_STUB
      // The trunk must sit on the target side of the source AND of every target,
      // else a branch would double back. If not, leave this cluster alone.
      const trunkOk =
        side === 'left'
          ? trunkX > src.x && txs.every((t) => t >= trunkX) && leaveSign > 0
          : trunkX < src.x && txs.every((t) => t <= trunkX) && leaveSign < 0
      if (!trunkOk) continue

      // 후보 폴리라인을 먼저 만들고, 하나라도 카드를 가로지르면 클러스터 전체를
      // 폴백(원래 A* 경로 유지). trunk/fork가 카드를 침범하지 않을 때만 커밋.
      const candidates = cluster.map((m) => {
        const t = m.pts[m.pts.length - 1]
        return {
          id: m.id,
          line: simplify([
            { x: src.x, y: src.y },
            { x: trunkX, y: src.y }, // shared: leave source along its row to the trunk
            { x: trunkX, y: t.y }, // shared: run the trunk to this member's row
            { x: t.x, y: t.y }, // fork: short stub into the target
          ]),
        }
      })
      // 이 번들의 끝점 카드(소스 PK 카드 + 각 타깃 FK 카드)는 가로지름 검사에서
      // 제외한다. 트렁크의 leave/fork는 자기 끝점 앵커에서 출발/도착하는데, 앵커가
      // 카드 박스 안쪽 몇 px에 있을 수 있어(React Flow 핸들/measured 폭) strict
      // -interior 검사가 거짓 양성을 낸다. 끝점 카드 grazing은 정상 — 무관한 중간
      // 카드 가로지름만 잡아야 버스가 살아남는다.
      const EPS = 2
      const anchors: Point[] = [src, ...cluster.map((m) => m.pts[m.pts.length - 1])]
      const checkObstacles = obstacles.filter(
        (o) =>
          !anchors.some(
            (p) =>
              p.x > o.x - EPS &&
              p.x < o.x + o.width + EPS &&
              p.y > o.y - EPS &&
              p.y < o.y + o.height + EPS,
          ),
      )
      const crosses = candidates.some((c) => {
        for (let i = 0; i < c.line.length - 1; i++) {
          if (crossesObstacle(c.line[i], c.line[i + 1], checkObstacles)) return true
        }
        return false
      })
      if (crosses) continue // 폴백: copies에는 이미 원래 경로의 deep-copy가 있다
      for (const c of candidates) copies.set(c.id, c.line)
    }
  }

  return copies
}
