import { memo, useMemo } from 'react'
import {
  BaseEdge,
  getSmoothStepPath,
  useNodes,
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
 * = a three-prong crow-foot. Drawn in a 16x16 box; refX=15 anchors the open
 * end at the line tip so the symbol sits just off the table edge.
 */
function markerPath(kind: MarkerKind): string {
  return kind === 'many'
    ? 'M15 2 L1 8 L15 14 M1 8 L15 8'
    : 'M11 2 L11 14'
}

/** Absolute top-left + measured size of a node (handles grouped children). */
function nodeRect(n: {
  position: { x: number; y: number }
  measured?: { width?: number; height?: number }
  width?: number
  height?: number
  internals?: { positionAbsolute?: { x: number; y: number } }
}): Rect {
  const pos = n.internals?.positionAbsolute ?? n.position
  return {
    x: pos.x,
    y: pos.y,
    width: n.measured?.width ?? n.width ?? 240,
    height: n.measured?.height ?? n.height ?? 80,
  }
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
  data,
}: RelationEdgeProps) {
  const nodes = useNodes()
  // Skip the (expensive) re-route while any node is being dragged — the layout
  // is in flux; smoothstep is good enough mid-drag and routing settles on stop.
  const dragging = useStore((s) => {
    for (const n of s.nodeLookup.values()) if (n.dragging) return true
    return false
  })

  const [smoothPath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  })

  const isEnumLink = data?.isEnumLink ?? false

  // Orthogonal route around the OTHER nodes. Null while dragging or for enum
  // links (those stay smoothstep). Memoized so A* runs only when inputs change.
  const orthoPath = useMemo(() => {
    if (dragging || isEnumLink) return null
    const obstacles: Rect[] = nodes
      .filter(
        (n) =>
          n.id !== source &&
          n.id !== target &&
          (n.type === 'table' || n.type === 'enum' || n.type === 'sticky'),
      )
      .map((n) => nodeRect(n))
    const points = routeOrthogonal(
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
      sourcePosition === Position.Left ? 'left' : 'right',
      targetPosition === Position.Left ? 'left' : 'right',
      obstacles,
    )
    return polylineToPath(points)
  }, [
    dragging,
    isEnumLink,
    nodes,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
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

  return (
    <>
      <defs>
        <marker
          id={`crowfoot-start-${id}`}
          markerWidth="16"
          markerHeight="16"
          refX="15"
          refY="8"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <path
            d={markerPath(startKind)}
            fill="none"
            style={{ stroke: strokeColor, strokeWidth }}
          />
        </marker>
        <marker
          id={`crowfoot-end-${id}`}
          markerWidth="16"
          markerHeight="16"
          refX="15"
          refY="8"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d={markerPath(endKind)}
            fill="none"
            style={{ stroke: strokeColor, strokeWidth }}
          />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={edgePath}
        markerStart={`url(#crowfoot-start-${id})`}
        markerEnd={`url(#crowfoot-end-${id})`}
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
