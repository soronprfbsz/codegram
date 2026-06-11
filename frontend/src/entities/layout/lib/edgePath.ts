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
 * Apply an endpoint anchor-side change (좌/우 스왑) to a stored edge entry.
 * Clears the manual waypoints (the old geometry is meaningless once the
 * endpoint jumps sides) and stores only NON-DEFAULT sides (source exits
 * RIGHT, target enters LEFT). Returns undefined when the entry becomes empty
 * — the caller drops it from the map.
 */
export function applyEdgeSide(
  entry: StoredEdgePath | undefined,
  end: 'source' | 'target',
  side: EdgeSide,
): StoredEdgePath | undefined {
  const next: StoredEdgePath = { ...entry }
  delete next.waypoints
  const key = end === 'source' ? 'sourceSide' : 'targetSide'
  const defaultSide: EdgeSide = end === 'source' ? 'right' : 'left'
  if (side === defaultSide) delete next[key]
  else next[key] = side
  return next.sourceSide || next.targetSide ? next : undefined
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
