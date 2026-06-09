import { memo } from 'react'
import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react'
import type { RelationEdgeData } from '@/entities/erd'
import type { DbmlRelation } from '@/entities/dbml'

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

/**
 * Custom React Flow edge for a DBML relationship — Backstage spec restyle
 * (Phase 4). Stroke uses --erd-edge (1.5px) or --erd-accent (2px) when active.
 * Crow-foot cardinality markers are colored to match.
 * Enum-link edges are dashed without crow-foot markers.
 * features layer: depends on shared + entities/erd + entities/dbml +
 * @xyflow/react (FSD downward imports).
 */
function RelationEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: RelationEdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  })

  const isActive = data?.active ?? false

  // Column -> enum links are a type association, NOT a cardinality
  // relationship: render them dashed and WITHOUT crow-foot markers.
  if (data?.isEnumLink) {
    return (
      <BaseEdge
        id={id}
        path={edgePath}
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

  // CSS variables cannot be used directly in SVG fill/stroke attributes —
  // use currentColor bridging via a wrapper or inline fallback strings.
  // We use a CSS class on the path and let the marker paths inherit stroke
  // through explicit attribute (CSS vars work in presentation attributes in
  // modern browsers via the var() function in inline styles).
  const strokeColor = isActive ? 'var(--erd-accent)' : 'var(--erd-edge)'
  const strokeWidth = isActive ? 2 : 1.5

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
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            fill="none"
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
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            fill="none"
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
