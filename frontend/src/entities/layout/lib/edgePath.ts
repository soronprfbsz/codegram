/**
 * PURE manual-edge-path geometry (ADR-0012). A manual path is stored as the
 * INTERIOR bend vertices (waypoints) of an orthogonal polyline; the endpoints
 * anchor to the live column handles. These helpers keep the CONTEXT.md
 * invariant — the path is ALWAYS orthogonal (axis-aligned segments only) —
 * by bridging non-aligned hops and merging re-aligned corners.
 *
 * entities layer: no React, no React Flow runtime (FSD downward imports).
 */
import type { XYPosition } from '@xyflow/react' // TYPE-ONLY import
import type { EdgePaths, EdgeSide, StoredEdgePath } from '../model/types'

export type PathPoint = XYPosition

const EPS = 0.5

function alignedX(a: PathPoint, b: PathPoint): boolean {
  return Math.abs(a.x - b.x) < EPS
}
function alignedY(a: PathPoint, b: PathPoint): boolean {
  return Math.abs(a.y - b.y) < EPS
}

/** Merge consecutive duplicate/collinear points (Q4: 직선화된 꺾임점 자동 병합). */
export function simplifyPath(pts: PathPoint[]): PathPoint[] {
  if (pts.length <= 2) return pts.slice()
  const out: PathPoint[] = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const dup = alignedX(a, b) && alignedY(a, b)
    const collinear = (alignedX(a, b) && alignedX(b, c)) || (alignedY(a, b) && alignedY(b, c))
    if (!dup && !collinear) out.push(b)
  }
  out.push(pts[pts.length - 1])
  return out
}

/**
 * Build the FULL orthogonal polyline: source + waypoints + target, with bridge
 * corners auto-inserted between any non-aligned consecutive pair. Bridging is
 * horizontal-first on every hop EXCEPT the final hop into the target, which is
 * vertical-first so the arrival segment stays horizontal (crow-foot markers
 * orient along the column row). For corner sequences produced by dragSegment
 * the bridging is a no-op; it only "repairs" after a table moved or a vertex
 * was edited numerically — which is exactly the dbdiagram stretch behavior.
 */
export function buildManualPath(
  source: PathPoint,
  target: PathPoint,
  waypoints: PathPoint[],
): PathPoint[] {
  const pts = [source, ...waypoints, target]
  const full: PathPoint[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const prev = full[full.length - 1]
    const next = pts[i]
    if (!alignedX(prev, next) && !alignedY(prev, next)) {
      const lastHop = i === pts.length - 1
      full.push(lastHop ? { x: prev.x, y: next.y } : { x: next.x, y: prev.y })
    }
    full.push(next)
  }
  return simplifyPath(full)
}

/**
 * Drag segment `segmentIndex` (between full[i] and full[i+1]) PERPENDICULAR to
 * its orientation: horizontal segments move to y=value, vertical to x=value.
 * A segment end that IS a path endpoint stays anchored — a stub corner is
 * inserted there instead (dbdiagram: dragging the first/last segment grows a
 * stub). Returns the new INTERIOR waypoint list (endpoints stripped), already
 * simplified (re-aligned corners merge away).
 */
export function dragSegment(
  full: PathPoint[],
  segmentIndex: number,
  value: number,
): PathPoint[] {
  const last = full.length - 1
  if (full.length < 2 || segmentIndex < 0 || segmentIndex >= last) {
    return full.slice(1, -1)
  }
  const a = full[segmentIndex]
  const b = full[segmentIndex + 1]
  const horizontal = alignedY(a, b)
  const moveP = (p: PathPoint): PathPoint =>
    horizontal ? { x: p.x, y: value } : { x: value, y: p.y }

  const out: PathPoint[] = []
  for (let i = 0; i < full.length; i++) {
    const p = full[i]
    if (i === segmentIndex) {
      if (i === 0) out.push(p, moveP(p)) // anchored source: stub corner
      else out.push(moveP(p))
    } else if (i === segmentIndex + 1) {
      if (i === last) out.push(moveP(p), p) // anchored target: stub corner
      else out.push(moveP(p))
    } else {
      out.push(p)
    }
  }
  return simplifyPath(out).slice(1, -1)
}

/**
 * Apply a single-axis edit of interior vertex `vertexIndex` (0-based within
 * the interior) from the Info panel. A vertex's x belongs to its VERTICAL
 * adjacent segment and its y to its HORIZONTAL one, so the edit reduces to
 * dragSegment on the axis-owning neighbor — canvas drag and panel edit share
 * one semantics (Q3 결정).
 */
export function editVertexAxis(
  full: PathPoint[],
  vertexIndex: number,
  axis: 'x' | 'y',
  value: number,
): PathPoint[] {
  const i = vertexIndex + 1 // interior index -> full-path index
  if (i <= 0 || i >= full.length - 1) return full.slice(1, -1)
  const prev = full[i - 1]
  const cur = full[i]
  // The adjacent segment that OWNS the edited axis is the one PERPENDICULAR to
  // it: x is owned by a vertical segment, y by a horizontal one.
  const prevOwns = axis === 'x' ? alignedX(prev, cur) : alignedY(prev, cur)
  const segIndex = prevOwns ? i - 1 : i
  return dragSegment(full, segIndex, value)
}

/**
 * Apply an endpoint anchor-side change (drag-to-flip) to a stored edge entry.
 * Clears the manual waypoints (the old geometry is meaningless once the endpoint
 * jumps sides) and ALWAYS records the chosen side. We cannot drop "default"
 * sides here: the un-stored default is GEOMETRIC (resolveEdgeSides flips an edge
 * whose target sits left of its source), so dropping a side would let geometry
 * override the user's explicit drag and silently undo the flip. An explicit pick
 * is sticky until the user flips again.
 */
/** A card rectangle (table/enum) the dragged segment must keep clear of. */
export interface CardRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Clamp a segment-drag coordinate so the dragged segment never crosses INTO a
 * card (kept ≥ `clearance` away) — "no line move may violate the minimum
 * clearance". `a`/`b` are the segment endpoints; `horizontal` segments move in
 * Y (coord = y), vertical ones in X (coord = x). A card blocks the move only
 * when the segment's span overlaps the card along the parallel axis; then the
 * coord is stopped at the inflated card edge nearest where the segment came
 * from. Pure; iterates a few passes so stacked cards all clamp.
 */
export function clampSegmentDrag(
  a: PathPoint,
  b: PathPoint,
  horizontal: boolean,
  coord: number,
  cards: CardRect[],
  clearance: number,
): number {
  const spanLo = Math.min(horizontal ? a.x : a.y, horizontal ? b.x : b.y)
  const spanHi = Math.max(horizontal ? a.x : a.y, horizontal ? b.x : b.y)
  const origin = horizontal ? a.y : a.x // where the segment started (assumed clear)
  let v = coord
  for (let pass = 0; pass < 4; pass++) {
    let moved = false
    for (const c of cards) {
      const parLo = (horizontal ? c.x : c.y) - clearance
      const parHi = (horizontal ? c.x + c.width : c.y + c.height) + clearance
      if (spanHi <= parLo || spanLo >= parHi) continue // no overlap along the segment
      const perpLo = (horizontal ? c.y : c.x) - clearance
      const perpHi = (horizontal ? c.y + c.height : c.x + c.width) + clearance
      if (v > perpLo && v < perpHi) {
        v = origin <= perpLo ? perpLo : perpHi
        moved = true
      }
    }
    if (!moved) break
  }
  return v
}

export function applyEdgeSide(
  entry: StoredEdgePath | undefined,
  end: 'source' | 'target',
  side: EdgeSide,
): StoredEdgePath | undefined {
  const next: StoredEdgePath = { ...entry }
  delete next.waypoints
  next[end === 'source' ? 'sourceSide' : 'targetSide'] = side
  return next
}

/** Drop manual paths whose edge no longer exists (GC at commit time, ADR-0012). */
export function pruneEdgePaths(
  paths: EdgePaths,
  validIds: ReadonlySet<string>,
): EdgePaths {
  const out: EdgePaths = {}
  for (const [id, p] of Object.entries(paths)) {
    if (validIds.has(id)) out[id] = p
  }
  return out
}
