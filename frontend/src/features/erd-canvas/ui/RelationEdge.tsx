import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  useStore,
  Position,
  type EdgeProps,
} from '@xyflow/react'
import { ArrowLeftRight, RotateCw } from 'lucide-react'
import type { RelationEdgeData } from '@/entities/erd'
import type { DbmlRelation } from '@/entities/dbml'
import {
  routeOrthogonal,
  polylineToPath,
  GROUP_CLEARANCE,
  inflateRect,
  type Rect,
} from '../lib/routeOrthogonal'

// Re-exported so existing consumers/tests can import it from this module too.
export { GROUP_CLEARANCE }
import {
  buildManualPath,
  dragSegment,
  type PathPoint,
} from '@/entities/layout'
import { useEdgePathContext } from '../lib/edgePathContext'
import { useRegisterRoute, useAdjustedRoutes } from '../lib/edgeRoutesContext'

export type RelationEdgeProps = EdgeProps & { data?: RelationEdgeData }

type MarkerKind = 'one' | 'many'

/** Horizontal spacing between the per-PK approach lanes at a target table. */
const LANE_GAP = 14

/** 장애물 선택용 최소 노드 형태(테스트 가능하도록 InternalNode에서 분리). */
export interface ObstacleNode {
  id: string
  type?: string
  parentId?: string
  rect: Rect
}

/**
 * 이 엣지의 A* 장애물 집합을 만든다.
 * - 모든 table/enum/sticky 카드는 항상 장애물.
 * - group 박스는 "이 엣지의 source 그룹도 target 그룹도 아닌" 경우에만 장애물
 *   → 무관한 그룹을 통째로 우회(공장라인 1단계 채널). 끝점이 속한 그룹은 제외해
 *   진입을 허용하되, 그 내부 테이블은 위 규칙으로 여전히 장애물(2단계 위빙).
 */
export function buildObstacles(
  nodes: ObstacleNode[],
  sourceId: string,
  targetId: string,
): Rect[] {
  const groupOf = (id: string): string | undefined =>
    nodes.find((n) => n.id === id)?.parentId
  const srcGroup = groupOf(sourceId)
  const tgtGroup = groupOf(targetId)
  const out: Rect[] = []
  for (const n of nodes) {
    if (n.type === 'table' || n.type === 'enum' || n.type === 'sticky') {
      out.push(n.rect)
    } else if (n.type === 'group') {
      // Non-endpoint group: inflate so corridors keep a clear gap from the box.
      if (n.id !== srcGroup && n.id !== tgtGroup) out.push(inflateRect(n.rect, GROUP_CLEARANCE))
    }
  }
  return out
}

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
 * The END marker (target, on the table's LEFT edge) anchors at x=15 (refX=15);
 * the START marker (source, on the table's RIGHT edge) is the horizontal MIRROR
 * anchored at x=1 (refX=1). Both use orient="auto" (NOT auto-start-reverse,
 * which renders the foot inside-out here — the symmetric look is in the path).
 *
 * The foot is INSET 5px from the table edge (the card-side region of the marker
 * box carries no glyph) so the relationship line shows as a short plain stub
 * between the entity and the crow-foot instead of the foot sitting flush on the
 * card. The apex still reaches ~14px out (within the MARGIN=16 step-out), so the
 * foot stays on the straight stub before the line turns.
 */
function markerPath(kind: MarkerKind, side: 'start' | 'end'): string {
  if (side === 'start') {
    // refX=1, +x points AWAY from the table → foot base at x=6 (5px stub), apex out at x=15.
    return kind === 'many'
      ? 'M6 2 L15 8 L6 14 M15 8 L6 8'
      : 'M7 2 L7 14'
  }
  // refX=15, +x points INTO the table → foot base at x=10 (5px stub), apex out at x=1.
  return kind === 'many'
    ? 'M10 2 L1 8 L10 14 M1 8 L10 8'
    : 'M9 2 L9 14'
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
 * Edges carrying manual `data.waypoints` (ADR-0012) render from those stored
 * points (bridged to the live endpoints) and skip A* routing entirely.
 * When selected, the edge is emphasized (accent halo + flowing-dash overlay,
 * dbdiagram-style) and shows draggable segment-midpoint handles (drag reroutes
 * a segment perpendicular to its orientation; hand cursor ONLY on these
 * handles), endpoint swap buttons (re-anchor an end to the table's other
 * side via ctx.setEdgeSide) plus a floating Reset line button that reverts a
 * manual path back to auto-routing.
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
  targetHandleId,
  data,
}: RelationEdgeProps) {
  // nodeLookup (InternalNode map) carries `internals.positionAbsolute` — correct
  // for grouped children too — and a stable reference across pan/zoom (it only
  // changes when nodes change), so we don't re-route on viewport moves.
  const nodeLookup = useStore((s) => s.nodeLookup)
  const registerRoute = useRegisterRoute()
  const adjustedRoutes = useAdjustedRoutes()

  const isEnumLink = data?.isEnumLink ?? false
  // NOTE: an EMPTY waypoints array is still a MANUAL path (the user dragged the
  // line straight — interior corners all merged away). Only absence (undefined)
  // means auto-routing; treating [] as auto would silently discard user intent.
  const manualWaypoints = data?.waypoints ?? null

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
  // Source fan-out lane: index of THIS edge among the relation edges LEAVING the
  // SAME source handle (the PK column), ordered by target handle. Edges sharing
  // a source PK otherwise leave on one shared corridor (the PK's exit row) and
  // overlap into a single line; a distinct lane per edge fans them apart.
  const sourceLaneIndex = useStore((s) => {
    if (isEnumLink) return 0
    const myKey = sourceHandleId ?? source
    const targets: string[] = []
    for (const e of s.edges) {
      if ((e.data as { isEnumLink?: boolean } | undefined)?.isEnumLink) continue
      if ((e.sourceHandle ?? e.source) !== myKey) continue
      targets.push(e.targetHandle ?? e.target)
    }
    const myTarget = targetHandleId ?? target
    const idx = [...new Set(targets)].sort().indexOf(myTarget)
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

  // Orthogonal route POINTS around the node rectangles. Null while dragging,
  // for enum links, and for manual-path edges (those render from stored points).
  // The SOURCE and TARGET cards are included as obstacles too: the step-out
  // ports sit `margin` OUTSIDE the anchor (on the inflated card border), and
  // crossesObstacle treats grazing the border as allowed (strict-interior
  // test), so the stub still leaves/enters cleanly — but the router can no
  // longer draw a segment straight THROUGH an endpoint card to reach an anchor
  // on its far side. That "tunnel under the card" path (hidden by the HTML node
  // layer that paints above the SVG edges) was the visible bug; routing around
  // the card keeps the whole line visible. Edges whose endpoints face each
  // other are unaffected — their L/Z path never enters either card interior.
  const orthoPoints = useMemo(() => {
    if (dragging || isEnumLink || manualWaypoints) return null
    const obsNodes: ObstacleNode[] = []
    for (const n of nodeLookup.values()) {
      if (
        n.type !== 'table' &&
        n.type !== 'enum' &&
        n.type !== 'sticky' &&
        n.type !== 'group'
      )
        continue
      const pos = n.internals.positionAbsolute
      obsNodes.push({
        id: n.id,
        type: n.type,
        parentId: n.parentId,
        rect: {
          x: pos.x,
          y: pos.y,
          // 그룹 박스는 style width/height(레이아웃이 설정), 카드는 measured.
          width: n.measured?.width ?? (n.style?.width as number | undefined) ?? 240,
          height: n.measured?.height ?? (n.style?.height as number | undefined) ?? 80,
        },
      })
    }
    const obstacles = buildObstacles(obsNodes, source, target)
    return routeOrthogonal(
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
      sourcePosition === Position.Left ? 'left' : 'right',
      targetPosition === Position.Left ? 'left' : 'right',
      obstacles,
      undefined,
      laneIndex * LANE_GAP,
      sourceLaneIndex * LANE_GAP,
      sourceLaneIndex * LANE_GAP,
    )
  }, [
    dragging,
    isEnumLink,
    manualWaypoints,
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
    sourceLaneIndex,
  ])

  // Bundle key = referenced PK (the source handle == the "one" side) + the
  // approach SIDE. Every edge leaving the SAME PK toward the same side forms
  // one bundle: the central pass runs them as ONE trunk across the canvas and
  // only forks to each target row near the targets — regardless of which table
  // the targets live in (a same-PK "bus" spans tables/groups).
  const bundleKey = `${sourceHandleId ?? source}|${targetPosition === Position.Left ? 'L' : 'R'}`

  useEffect(() => {
    registerRoute?.(id, orthoPoints ?? null, bundleKey)
    return () => registerRoute?.(id, null)
  }, [registerRoute, id, orthoPoints, bundleKey])

  // Manual path: stored waypoints + live endpoints, bridged to stay orthogonal.
  // Cheap (no A*), so it does NOT fall back to smoothstep during node drags —
  // the waypoints stay put and only the end segments stretch (dbdiagram 실측).
  const manualPoints = useMemo(() => {
    if (!manualWaypoints || isEnumLink) return null
    return buildManualPath(
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
      manualWaypoints,
    )
  }, [manualWaypoints, isEnumLink, sourceX, sourceY, targetX, targetY])

  const isEdgeSelected = (data?.isEdgeSelected ?? false) && !isEnumLink
  const ctx = useEdgePathContext()
  const { screenToFlowPosition } = useReactFlow()

  // Live drag draft: interior waypoints while a segment handle is being
  // dragged. Geometry is computed from the path CAPTURED at pointerdown (not
  // the draft) so the dragged segment's index never shifts under the pointer.
  const [draftWaypoints, setDraftWaypoints] = useState<PathPoint[] | null>(null)
  const dragStateRef = useRef<{
    full: PathPoint[]
    segmentIndex: number
    draft?: PathPoint[]
  } | null>(null)

  const draftPoints = useMemo(() => {
    if (!draftWaypoints) return null
    return buildManualPath(
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
      draftWaypoints,
    )
  }, [draftWaypoints, sourceX, sourceY, targetX, targetY])

  // The polyline actually rendered this frame (draft > manual > auto).
  // Prefer the spread (adjusted) route; on first paint / before the rAF settle
  // this falls back to the raw orthoPoints (a one-frame ≤gap reflow, not a bug).
  const autoPoints = adjustedRoutes.get(id) ?? orthoPoints
  const renderedPoints = draftPoints ?? manualPoints ?? autoPoints

  // Report the rendered path while selected — feeds SelectionInfo + panel
  // edits (auto edges have no stored waypoints; the canvas needs this copy).
  useEffect(() => {
    if (isEdgeSelected && renderedPoints) {
      ctx.reportPath(id, renderedPoints)
    }
  }, [isEdgeSelected, renderedPoints, ctx, id])

  function onHandlePointerDown(e: React.PointerEvent, segmentIndex: number) {
    if (!renderedPoints) return
    e.stopPropagation()
    e.preventDefault()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragStateRef.current = { full: renderedPoints.map((p) => ({ ...p })), segmentIndex }
  }
  function onHandlePointerMove(e: React.PointerEvent) {
    const st = dragStateRef.current
    if (!st) return
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const a = st.full[st.segmentIndex]
    const b = st.full[st.segmentIndex + 1]
    const horizontal = Math.abs(a.y - b.y) < 0.5
    const next = dragSegment(
      st.full,
      st.segmentIndex,
      horizontal ? flowPos.y : flowPos.x,
    )
    // Stash on the ref too: the pointerup commit reads st.draft directly, so
    // correctness does not depend on React having flushed the state update.
    st.draft = next
    setDraftWaypoints(next)
  }
  function onHandlePointerUp() {
    const st = dragStateRef.current
    dragStateRef.current = null
    const committed = st?.draft ?? draftWaypoints
    if (st && committed) {
      ctx.commitWaypoints(id, committed)
    }
    setDraftWaypoints(null)
  }
  // Aborted gestures (pointercancel: touch interruption, context menu, OS
  // gesture) clear the drag WITHOUT committing. Also wired to
  // lostpointercapture, which ALSO fires after a normal pointerup — safe,
  // because pointerup runs FIRST: the commit already happened and
  // dragStateRef is null, so this just re-clears nulls.
  function onHandlePointerAbort() {
    dragStateRef.current = null
    setDraftWaypoints(null)
  }

  const isActive = data?.active ?? false
  // SVG presentation ATTRIBUTES (stroke="...") do NOT support var() — only CSS
  // (the `style` prop) does. Marker paths therefore set stroke via `style`.
  const emphasized = isActive || isEdgeSelected
  const strokeColor = emphasized ? 'var(--erd-accent)' : 'var(--erd-edge)'
  const strokeWidth = emphasized ? 2 : 1.5

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
  const edgePath = renderedPoints ? polylineToPath(renderedPoints) : smoothPath
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
      {/* Selection halo — soft accent glow UNDER the line (가시성 강조) */}
      {isEdgeSelected && (
        <path
          d={edgePath}
          fill="none"
          style={{
            stroke: 'var(--erd-accent)',
            strokeWidth: 7,
            strokeLinecap: 'round',
            opacity: 0.18,
            pointerEvents: 'none',
          }}
        />
      )}
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
      {/* Flowing dots — animated dash overlay ON TOP of the selected line
          (stroke-dashoffset keyframes in index.css), dbdiagram-style 방향성 표시 */}
      {isEdgeSelected && (
        <path
          data-testid="edge-flow"
          d={edgePath}
          fill="none"
          className="erd-edge-flow"
          style={{
            stroke: 'var(--erd-surface)',
            strokeWidth: 2,
            strokeLinecap: 'round',
            strokeDasharray: '2 10',
            opacity: 0.95,
            pointerEvents: 'none',
          }}
        />
      )}
      {isEdgeSelected && renderedPoints && (
        <g data-testid="edge-handles">
          {/* Anchored endpoints — visual only (끝점은 컬럼에 앵커, 편집 불가) */}
          <circle
            cx={renderedPoints[0].x}
            cy={renderedPoints[0].y}
            r={3.5}
            style={{ fill: 'var(--erd-accent)', pointerEvents: 'none' }}
          />
          <circle
            cx={renderedPoints[renderedPoints.length - 1].x}
            cy={renderedPoints[renderedPoints.length - 1].y}
            r={3.5}
            style={{ fill: 'var(--erd-accent)', pointerEvents: 'none' }}
          />
          {/* Interior corner dots — visual markers (드래그는 세그먼트 핸들로) */}
          {renderedPoints.slice(1, -1).map((p, i) => (
            <circle
              key={`c${i}`}
              cx={p.x}
              cy={p.y}
              r={3}
              style={{ fill: 'var(--erd-surface)', stroke: 'var(--erd-accent)', strokeWidth: 1.5, pointerEvents: 'none' }}
            />
          ))}
          {/* Segment midpoint DRAG handles (dbdiagram 실측 모델) */}
          {renderedPoints.slice(0, -1).map((p, i) => {
            const q = renderedPoints[i + 1]
            const len = Math.abs(q.x - p.x) + Math.abs(q.y - p.y)
            if (len < 12) return null // 너무 짧은 세그먼트는 핸들 생략
            const horizontal = Math.abs(p.y - q.y) < 0.5
            return (
              <circle
                key={`s${i}`}
                data-testid={`edge-seg-${i}`}
                data-orient={horizontal ? 'h' : 'v'}
                cx={(p.x + q.x) / 2}
                cy={(p.y + q.y) / 2}
                r={5}
                style={{
                  fill: 'var(--erd-surface)',
                  stroke: 'var(--erd-accent)',
                  strokeWidth: 1.5,
                  // 요구사항: 선을 움직일 수 있는 포인트에서만 hand 커서.
                  cursor: 'pointer',
                  // React Flow v12: .react-flow__edge { pointer-events: visibleStroke }
                  // 를 상속하면 1.5px 링만 클릭된다 — 채움 영역 전체를 히트 대상으로.
                  pointerEvents: 'all',
                }}
                onPointerDown={(e) => onHandlePointerDown(e, i)}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                onPointerCancel={onHandlePointerAbort}
                onLostPointerCapture={onHandlePointerAbort}
              />
            )
          })}
        </g>
      )}
      {isEdgeSelected && renderedPoints && (
        <EdgeLabelRenderer>
          {(() => {
            const midPoint = renderedPoints[Math.floor(renderedPoints.length / 2)]
            const floatBtnStyle = (x: number, y: number): React.CSSProperties => ({
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
              pointerEvents: 'all',
              width: 26,
              height: 26,
              borderRadius: 8,
              border: '1px solid var(--erd-border-2)',
              background: 'var(--erd-surface)',
              color: 'var(--erd-accent)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--erd-shadow-sm)',
            })
            // Swap buttons float just OUTSIDE each endpoint, along the exit
            // direction, lifted off the line so they don't cover the marker.
            const srcDx = sourcePosition === Position.Left ? -22 : 22
            const tgtDx = targetPosition === Position.Left ? -22 : 22
            return (
              <>
                <button
                  data-testid="edge-swap-source"
                  title="좌/우 전환 (source)"
                  onClick={() =>
                    ctx.setEdgeSide(
                      id,
                      'source',
                      sourcePosition === Position.Left ? 'right' : 'left',
                    )
                  }
                  style={floatBtnStyle(sourceX + srcDx, sourceY - 20)}
                >
                  <ArrowLeftRight size={13} strokeWidth={2} />
                </button>
                <button
                  data-testid="edge-swap-target"
                  title="좌/우 전환 (target)"
                  onClick={() =>
                    ctx.setEdgeSide(
                      id,
                      'target',
                      targetPosition === Position.Left ? 'right' : 'left',
                    )
                  }
                  style={floatBtnStyle(targetX + tgtDx, targetY - 20)}
                >
                  <ArrowLeftRight size={13} strokeWidth={2} />
                </button>
                {manualWaypoints && (
                  <button
                    data-testid="edge-reset"
                    title="Reset line"
                    onClick={() => ctx.resetPath(id)}
                    style={floatBtnStyle(midPoint.x + 18, midPoint.y - 18)}
                  >
                    <RotateCw size={14} strokeWidth={2} />
                  </button>
                )}
              </>
            )
          })()}
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const RelationEdge = memo(RelationEdgeImpl)
