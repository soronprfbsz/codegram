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

/**
 * How far ABOVE the topmost target table the intra-group "spine" runs. The spine
 * is the shared horizontal avenue a same-PK bundle travels along after entering a
 * table group; forks then drop DOWN each column gutter into the FK rows. Kept
 * inside the group's top padding band so it never overlaps a card.
 */
const SPINE_RISE = 40

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
 * Rewrite each same-PK bundle's members onto a shared structure that forks per row.
 * Two geometries: targets OUTSIDE any group share a cross-canvas vertical trunk;
 * targets INSIDE a group box (`groups`) get the 2-level "spine bus" — descend the
 * group's entry gutter, run a horizontal spine just above the target row, then
 * fork DOWN each column gutter into the FK (so interior-column tables are entered
 * top/bottom rather than tunnelled into horizontally). Returns a NEW map
 * id -> adjusted points; inputs are not mutated. Null-key or <2-member bundles,
 * and members whose candidate path would cross a card, are copied through unchanged.
 */
export function mergeBundleRoutes(
  routes: EdgeRoute[],
  bundleKeyOf: (id: string) => string | null,
  obstacles: Rect[] = [],
  groupBoxes: Rect[] = [],
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

    // PER-SEGMENT grazing test. A segment may legitimately pass through a card
    // only if that card contains one of the segment's OWN endpoints (the stub
    // leaving the source PK card / entering a target FK card — the anchor sits a
    // few px inside the box: React Flow handle/measured geometry). It must NOT
    // tunnel through any OTHER card (incl. a different bundle member's target). So
    // for each segment, exclude only the cards holding its endpoints, then test.
    const EPS = 2
    const contains = (o: Rect, p: Point): boolean =>
      p.x > o.x - EPS &&
      p.x < o.x + o.width + EPS &&
      p.y > o.y - EPS &&
      p.y < o.y + o.height + EPS
    const lineCrosses = (line: Point[]): boolean => {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i]
        const b = line[i + 1]
        const others = obstacles.filter((o) => !contains(o, a) && !contains(o, b))
        if (crossesObstacle(a, b, others)) return true
      }
      return false
    }
    const targetOf = (m: (typeof members)[number]): Point => m.pts[m.pts.length - 1]

    // Partition members by whether the target sits INSIDE a table group box.
    // Grouped targets get the 2-level "spine bus" (descend the group's entry
    // gutter → run a horizontal spine above the target row → fork DOWN each column
    // gutter into the FK). Targets outside any group keep the cross-canvas
    // vertical trunk. (No groups passed ⇒ everything is loose ⇒ legacy behavior.)
    const groupedMembers = new Map<number, typeof members>()
    const loose: typeof members = []
    for (const m of members) {
      const gi = groupBoxes.findIndex((g) => contains(g, targetOf(m)))
      if (gi >= 0) {
        const arr = groupedMembers.get(gi)
        if (arr) arr.push(m)
        else groupedMembers.set(gi, [m])
      } else loose.push(m)
    }

    // --- Ungrouped targets: cross-canvas vertical trunk (X-clustered) ---
    const byTx = [...loose].sort((a, b) => targetOf(a).x - targetOf(b).x)
    const clusters: (typeof members)[] = []
    for (const m of byTx) {
      const tx = targetOf(m).x
      const last = clusters[clusters.length - 1]
      const lastTx = last ? targetOf(last[last.length - 1]).x : 0
      if (last && tx - lastTx <= CLUSTER_GAP) last.push(m)
      else clusters.push([m])
    }
    for (const cluster of clusters) {
      if (cluster.length < 2) continue // a lone target keeps its own A* route
      const txs = cluster.map((m) => targetOf(m).x)
      const trunkX =
        side === 'left' ? Math.min(...txs) - APPROACH_STUB : Math.max(...txs) + APPROACH_STUB
      const trunkOk =
        side === 'left'
          ? trunkX > src.x && txs.every((t) => t >= trunkX) && leaveSign > 0
          : trunkX < src.x && txs.every((t) => t <= trunkX) && leaveSign < 0
      if (!trunkOk) continue
      const candidates = cluster.map((m) => {
        const t = targetOf(m)
        return {
          id: m.id,
          line: simplify([
            { x: src.x, y: src.y },
            { x: trunkX, y: src.y },
            { x: trunkX, y: t.y },
            { x: t.x, y: t.y },
          ]),
        }
      })
      if (candidates.some((c) => lineCrosses(c.line))) continue // fallback (whole cluster)
      for (const c of candidates) copies.set(c.id, c.line)
    }

    // --- Grouped targets: 2-level spine bus, per group ---
    for (const cluster of groupedMembers.values()) {
      if (cluster.length < 2) continue
      const txs = cluster.map((m) => targetOf(m).x)
      // Descent column: just OUTSIDE the nearest target (the group's entry gutter).
      const descentX =
        side === 'left' ? Math.min(...txs) - APPROACH_STUB : Math.max(...txs) + APPROACH_STUB
      const geomOk =
        side === 'left'
          ? descentX > src.x && txs.every((t) => t >= descentX) && leaveSign > 0
          : descentX < src.x && txs.every((t) => t <= descentX) && leaveSign < 0
      if (!geomOk) continue
      // Spine row: just ABOVE the topmost target table (in the group's top padding,
      // clear of cards), so the shared horizontal run never crosses a card.
      const topOf = (t: Point): number => {
        const card = obstacles.find((o) => contains(o, t))
        return card ? card.y : t.y
      }
      const spineY = Math.min(...cluster.map((m) => topOf(targetOf(m)))) - SPINE_RISE
      // Per-MEMBER commit: an outermost-column target (gx === descentX) collapses
      // to a plain vertical approach from the entry gutter; interior columns ride
      // the spine then fork down their own gutter. A member whose path would cross
      // a card keeps its raw A* route, so one awkward target never breaks the bus.
      for (const m of cluster) {
        const t = targetOf(m)
        const gx = side === 'left' ? t.x - APPROACH_STUB : t.x + APPROACH_STUB
        const line = simplify([
          { x: src.x, y: src.y },
          { x: descentX, y: src.y }, // leave source to the group entry gutter
          { x: descentX, y: spineY }, // descend the entry gutter up to the spine
          { x: gx, y: spineY }, // spine: run above the row to this column's gutter
          { x: gx, y: t.y }, // fork: drop down the column gutter to the FK row
          { x: t.x, y: t.y }, // stub into the target
        ])
        if (!lineCrosses(line)) copies.set(m.id, line)
      }
    }
  }

  return copies
}
