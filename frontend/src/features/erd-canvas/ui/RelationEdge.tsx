import { memo, useMemo } from 'react'
import {
  BaseEdge,
  getSmoothStepPath,
  useStore,
  Position,
  type EdgeProps,
} from '@xyflow/react'
import type { RelationEdgeData } from '@/entities/erd'
import type { DbmlRelation } from '@/entities/dbml'
import {
  routeOrthogonal,
  polylineToPath,
  type Rect,
} from '../lib/routeOrthogonal'

export type RelationEdgeProps = EdgeProps & { data?: RelationEdgeData }

type MarkerKind = 'one' | 'many'

/** Horizontal spacing between the per-PK approach lanes at a target table. */
const LANE_GAP = 14

/** Crow-foot kind for the SOURCE end = the `from` half of `${from}-${to}`. */
export function startMarkerKind(relation: DbmlRelation): MarkerKind {
  return relation.startsWith('n') ? 'many' : 'one'
}

/** Crow-foot kind for the TARGET end = the `to` half of `${from}-${to}`. */
export function endMarkerKind(relation: DbmlRelation): MarkerKind {
  return relation.endsWith('n') ? 'many' : 'one'
}

/**
 * SVG path for a crow-foot marker. 'one' = a single perpendicular bar; 'many'
 * = a three-prong crow-foot. Drawn in a 16x16 box.
 *
 * The END marker (target, on the table's LEFT edge) anchors the foot at x=15
 * (refX=15) with the apex at x=1, under orient="auto" — foot hugs the edge,
 * apex on the line. The START marker (source, on the table's RIGHT edge) is the
 * horizontal MIRROR (x -> 16 - x), anchored at x=1 (refX=1), ALSO under
 * orient="auto". We do NOT use orient="auto-start-reverse": it renders the foot
 * mirrored/inside-out here, so the symmetric look is built into the path instead.
 */
function markerPath(kind: MarkerKind, side: 'start' | 'end'): string {
  if (side === 'start') {
    return kind === 'many'
      ? 'M1 2 L15 8 L1 14 M15 8 L1 8'
      : 'M5 2 L5 14'
  }
  return kind === 'many'
    ? 'M15 2 L1 8 L15 14 M1 8 L15 8'
    : 'M11 2 L11 14'
}

/**
 * Custom React Flow edge for a DBML relationship — Backstage spec restyle
 * (Phase 4) + orthogonal obstacle-avoiding routing (gutter routing). The path is
 * routed AROUND other node rectangles via routeOrthogonal so edges travel in the
 * gaps between entities instead of crossing the cards. During an active drag the
 * route falls back to smoothstep (cheap) and re-routes when the layout settles.
 * Stroke uses --erd-edge (1.5px) or --erd-accent (2px) when active. Crow-foot
 * cardinality markers set stroke via `style` (var() is invalid in SVG
 * presentation attributes). Enum-link edges are dashed, smoothstep, no markers.
 * features layer: depends on shared + entities/erd + entities/dbml +
 * @xyflow/react (FSD downward imports).
 */
function RelationEdgeImpl({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  data,
}: RelationEdgeProps) {
  // nodeLookup (InternalNode map) carries `internals.positionAbsolute` — correct
  // for grouped children too — and a stable reference across pan/zoom (it only
  // changes when nodes change), so we don't re-route on viewport moves.
  const nodeLookup = useStore((s) => s.nodeLookup)

  const isEnumLink = data?.isEnumLink ?? false

  // Approach-lane index for this edge among the relation edges entering the SAME
  // target table, grouped by referenced PK (the source handle == the `${schema}.
  // ${table}.${col}` of the "one" side). Edges sharing a PK get the same index
  // (stay bundled on one lane); edges to DIFFERENT PKs get distinct indices and
  // so enter on separate vertical lanes. The selector returns the bare index so
  // a selection/viewport change (which mutates the edges array) does NOT re-route
  // unless this edge's lane actually moves.
  const laneIndex = useStore((s) => {
    if (isEnumLink) return 0
    const keys = new Set<string>()
    for (const e of s.edges) {
      if (e.target !== target) continue
      if ((e.data as { isEnumLink?: boolean } | undefined)?.isEnumLink) continue
      keys.add(e.sourceHandle ?? e.source)
    }
    const myKey = sourceHandleId ?? source
    const idx = [...keys].sort().indexOf(myKey)
    return idx < 0 ? 0 : idx
  })
  // Skip the (expensive) re-route while any node is being dragged — the layout
  // is in flux; smoothstep is good enough mid-drag and routing settles on stop.
  const dragging = useMemo(() => {
    for (const n of nodeLookup.values()) if (n.dragging) return true
    return false
  }, [nodeLookup])

  const [smoothPath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  })

  // Orthogonal route around the OTHER nodes. Null while dragging or for enum
  // links (those stay smoothstep). Memoized so A* runs only when inputs change.
  const orthoPath = useMemo(() => {
    if (dragging || isEnumLink) return null
    const obstacles: Rect[] = []
    for (const n of nodeLookup.values()) {
      if (n.id === source || n.id === target) continue
      if (n.type !== 'table' && n.type !== 'enum' && n.type !== 'sticky') continue
      const pos = n.internals.positionAbsolute
      obstacles.push({
        x: pos.x,
        y: pos.y,
        width: n.measured?.width ?? 240,
        height: n.measured?.height ?? 80,
      })
    }
    const points = routeOrthogonal(
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
      sourcePosition === Position.Left ? 'left' : 'right',
      targetPosition === Position.Left ? 'left' : 'right',
      obstacles,
      undefined,
      laneIndex * LANE_GAP,
    )
    return polylineToPath(points)
  }, [
    dragging,
    isEnumLink,
    nodeLookup,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    laneIndex,
  ])

  const isActive = data?.active ?? false
  // SVG presentation ATTRIBUTES (stroke="...") do NOT support var() — only CSS
  // (the `style` prop) does. Marker paths therefore set stroke via `style`.
  const strokeColor = isActive ? 'var(--erd-accent)' : 'var(--erd-edge)'
  const strokeWidth = isActive ? 2 : 1.5

  // Column -> enum links are a type association, NOT a cardinality relationship:
  // dashed, smoothstep, no crow-foot markers.
  if (isEnumLink) {
    return (
      <BaseEdge
        id={id}
        path={smoothPath}
        style={{
          stroke: 'var(--erd-edge)',
          strokeWidth: 1.5,
          strokeDasharray: '4 4',
        }}
      />
    )
  }

  const relation = data?.relation ?? '1-n'
  const startKind = startMarkerKind(relation)
  const endKind = endMarkerKind(relation)
  const edgePath = orthoPath ?? smoothPath
  // The edge id contains '(', ')', '>', '#' (e.g. `public.a.(bid)>public.b.(id)#0`).
  // A ')' inside `url(#…)` closes the reference early, so the markers never apply
  // — sanitize the id to [A-Za-z0-9_-] for the marker id + its url() reference.
  const mid = id.replace(/[^a-zA-Z0-9_-]/g, '_')

  return (
    <>
      <defs>
        <marker
          id={`crowfoot-start-${mid}`}
          markerWidth="16"
          markerHeight="16"
          refX="1"
          refY="8"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d={markerPath(startKind, 'start')}
            fill="none"
            style={{ stroke: strokeColor, strokeWidth }}
          />
        </marker>
        <marker
          id={`crowfoot-end-${mid}`}
          markerWidth="16"
          markerHeight="16"
          refX="15"
          refY="8"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d={markerPath(endKind, 'end')}
            fill="none"
            style={{ stroke: strokeColor, strokeWidth }}
          />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={edgePath}
        markerStart={`url(#crowfoot-start-${mid})`}
        markerEnd={`url(#crowfoot-end-${mid})`}
        style={{
          stroke: strokeColor,
          strokeWidth,
          transition: 'stroke 80ms ease, stroke-width 80ms ease',
        }}
      />
    </>
  )
}

export const RelationEdge = memo(RelationEdgeImpl)
