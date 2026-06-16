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
import type { Point } from './routeOrthogonal'

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
export function spreadEdgeRoutes(routes: EdgeRoute[], gap = 12): Map<string, Point[]> {
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

  // 3. Group segments that are collinear (same orient + same fixed, integer-grid
  //    exact equality), have OVERLAPPING ranges, and come from DIFFERENT edges.
  //    Transitive grouping via union-find so a chain A–B–C lands in one group.
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
      // Exact === is safe: routes come off the integer grid (routeOrthogonal's
      // candidate lines are integer obstacle/port coords), so collinear segments
      // share an exact `fixed` value — no float tolerance needed.
      if (sa.fixed !== sb.fixed) continue
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

  // 4. For each group of size k >= 2: order deterministically by (id, i) and
  //    assign track offset (j - (k-1)/2) * gap. Shift the segment perpendicular
  //    to its orientation by moving BOTH endpoint vertices. Because neighbouring
  //    segments are perpendicular and share those vertices, the polyline stays
  //    orthogonal (the neighbours just change length). Stubs are never in this
  //    set, so anchors never move.
  for (const members of groups.values()) {
    if (members.length < 2) continue
    members.sort((m, n) => {
      const sm = segments[m]
      const sn = segments[n]
      if (sm.id !== sn.id) return sm.id < sn.id ? -1 : 1
      return sm.i - sn.i
    })
    const k = members.length
    members.forEach((m, j) => {
      const seg = segments[m]
      const offset = (j - (k - 1) / 2) * gap
      if (offset === 0) return
      const pts = copies.get(seg.id)!
      if (seg.orient === 'v') {
        // vertical segment → shift perpendicular = X on both vertices
        pts[seg.i].x += offset
        pts[seg.i + 1].x += offset
      } else {
        // horizontal segment → shift perpendicular = Y on both vertices
        pts[seg.i].y += offset
        pts[seg.i + 1].y += offset
      }
    })
  }

  // 5. Return the adjusted (copied) points.
  return copies
}
