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
import {
  crossesObstacle,
  routeOrthogonal,
  inflateRect,
  GROUP_CLEARANCE,
  type Rect,
  type Point,
} from './routeOrthogonal'
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

    // src가 속한 그룹 인덱스(없으면 -1). 트렁크/진입이 가로질러선 안 되는 비-끝점
    // 그룹을 가려낼 때 src 그룹은 제외한다(소스는 그 박스 안에서 출발하므로).
    const srcGroupIdx = groupBoxes.findIndex((g) => contains(g, src))
    // 한 박스 line이 그 박스 내부를 가로지르는지(자기 끝점 든 박스는 제외 — 기존 규칙).
    const crossesAnyGroup = (line: Point[], boxes: Rect[]): boolean => {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i]
        const b = line[i + 1]
        const others = boxes.filter((o) => !contains(o, a) && !contains(o, b))
        if (crossesObstacle(a, b, others)) return true
      }
      return false
    }

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
    // 트렁크가 가로질러선 안 되는 비-끝점 그룹: 목적지는 loose라 어떤 그룹에도 속하지
    // 않으므로 src 그룹만 제외한다. 트렁크가 이 중 하나라도 관통하면 번들을 포기하고
    // 각 멤버의 (이미 그룹을 회피하는) 개별 A* 경로를 유지한다. GROUP_CLEARANCE만큼
    // inflate해 트렁크가 그룹에 바짝 붙지 않고 일정 간격을 두게 한다(per-edge 코리도와 동일).
    const looseNonEndpointGroups = groupBoxes
      .filter((_, i) => i !== srcGroupIdx)
      .map((g) => inflateRect(g, GROUP_CLEARANCE))
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
      if (
        candidates.some(
          (c) => lineCrosses(c.line) || crossesAnyGroup(c.line, looseNonEndpointGroups),
        )
      )
        continue // fallback (whole cluster): crosses a card OR a non-endpoint group box
      for (const c of candidates) copies.set(c.id, c.line)
    }

    // --- Grouped targets: 2-level spine bus, per group ---
    const samePoint = (p: Point, q: Point): boolean => p.x === q.x && p.y === q.y

    for (const [gi, cluster] of groupedMembers.entries()) {
      if (cluster.length < 2) continue
      const txs = cluster.map((m) => targetOf(m).x)
      // descentX: 가장 가까운 목적지 바깥의 진입 거터 x (그룹 진입 수직선).
      // spineY:   그룹 내 최상단 목적지 행 위의 공유 수평 avenue y (SPINE_RISE만큼 위).
      const descentX =
        side === 'left' ? Math.min(...txs) - APPROACH_STUB : Math.max(...txs) + APPROACH_STUB
      // 가드는 leave 방향 일관성만 본다. 예전엔 `descentX > src.x`(소스가 모든 타깃의
      // 한쪽)도 요구했으나, 그 제약은 organizations처럼 사방으로 참조되는 중앙 소스를
      // 펼쳤다(타깃이 소스를 좌우로 걸침). 진입은 항상 그룹의 (side 기준) 진입 거터로
      // 들어가고 — 직선 진입이 카드/그룹을 가로지르면 model-1 A*가 우회, 그래도 남는
      // 관통은 아래 per-member lineCrosses/crossesAnyGroup가 폴백시킨다(never worse).
      const geomOk = side === 'left' ? leaveSign > 0 : leaveSign < 0
      if (!geomOk) continue
      const topOf = (t: Point): number => {
        const card = obstacles.find((o) => contains(o, t))
        return card ? card.y : t.y
      }
      const spineY = Math.min(...cluster.map((m) => topOf(targetOf(m)))) - SPINE_RISE

      // 진입 구간: 기본은 직선 하강. 직선이 카드(테이블) 또는 비-끝점 그룹 박스를
      // 가로지르면 A*로 클러스터당 1개 공유 진입 trunk를 구해 우회한다. A*가 못 찾으면
      // 직선으로 안전 폴백(현행 동작). 깨끗하면 직선 유지 → 기존 정확점 테스트 보존.
      const straightApproach: Point[] = [
        { x: src.x, y: src.y },
        { x: descentX, y: src.y },
        { x: descentX, y: spineY },
      ]
      // 비-끝점 그룹을 GROUP_CLEARANCE만큼 inflate: A* 진입 트렁크가 그룹을 일정
      // 간격 두고 우회하고, 커밋 체크에서 트렁크가 그룹에 바짝 붙으면 폴백시킨다.
      const nonEndpointGroups = groupBoxes
        .filter((_, i) => i !== gi && i !== srcGroupIdx)
        .map((g) => inflateRect(g, GROUP_CLEARANCE))
      let approachPath = straightApproach
      if (lineCrosses(straightApproach) || crossesAnyGroup(straightApproach, nonEndpointGroups)) {
        const entry = { x: descentX, y: spineY }
        const approachObstacles = [...obstacles, ...nonEndpointGroups]
        // A* target을 spineY-1로 설정: routeOrthogonal이 수평으로 target에 도달하므로
        // entry 직전에 (descentX, spineY-1)→(descentX, spineY) 수직 세그먼트가 생겨
        // member loop에서 simplify가 entry 점을 collinear로 제거하지 않는다.
        const aTarget = { x: descentX, y: spineY - 1 }
        const srcSide = leaveSign > 0 ? 'right' : 'left'
        const a = routeOrthogonal(
          { x: src.x, y: src.y },
          aTarget,
          srcSide,
          side,
          approachObstacles,
        )
        // 이 guard는 A* 결과의 유효성(시작·끝점 일치)만 확인한다.
        // 실제 카드 교차 안전망은 아래 member loop의 lineCrosses(line) 체크다:
        // guard를 통과해도 각 멤버 경로가 카드를 가로지르면 lineCrosses가
        // copies 업데이트를 건너뛰어 해당 멤버는 원래 A* 경로를 유지한다.
        if (a.length >= 2 && samePoint(a[0], src) && samePoint(a[a.length - 1], aTarget)) {
          approachPath = [...a, entry]
        }
      }

      for (const m of cluster) {
        const t = targetOf(m)
        const gx = side === 'left' ? t.x - APPROACH_STUB : t.x + APPROACH_STUB
        const line = simplify([
          ...approachPath,
          { x: gx, y: spineY },
          { x: gx, y: t.y },
          { x: t.x, y: t.y },
        ])
        // 카드뿐 아니라 비-끝점 그룹 박스도 가로지르면 그 멤버는 폴백(원래 A* 경로
        // 유지). spine/포크나 A* 우회 실패로 남는 그룹 관통을 커밋 직전에 막는다.
        if (!lineCrosses(line) && !crossesAnyGroup(line, nonEndpointGroups))
          copies.set(m.id, line)
      }
    }
  }

  return copies
}
