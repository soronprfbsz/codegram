import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Panel,
  useNodesState,
  useReactFlow,
  useViewport,
  type NodeTypes,
  type EdgeTypes,
  type ReactFlowInstance,
  type XYPosition,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Maximize, Minimize, Grid2x2, Plus, Minus, Maximize2 } from 'lucide-react'
import type { DbmlSchema } from '@/entities/dbml'
import {
  schemaToFlow,
  type ErdFlowNode,
  type TableNodeData,
  type ErdColumn,
  type CanvasSelection,
  type SelectionInfo,
  type RelationEdgeData,
} from '@/entities/erd'
import {
  reconcileLayout,
  nodesToLayout,
  pruneEdgePaths,
  applyEdgeSide,
  editVertexAxis,
  arrangeGroupInPlace,
  type LayoutPositions,
  type StoredLayout,
  type EdgePaths,
  type PathPoint,
} from '@/entities/layout'
import { EdgePathContext, type EdgePathContextValue } from '../lib/edgePathContext'
import { EdgeRoutesProvider } from '../lib/edgeRoutesContext'
import { resolveEdgeSides } from '../lib/edgeSides'
import { GroupActionContext, type GroupActionContextValue } from '../lib/groupActionContext'
import { getHelperLines } from '../lib/helperLines'
import { TableNode } from './TableNode'
import { EnumNode } from './EnumNode'
import { StickyNote } from './StickyNote'
import { GroupNode } from './GroupNode'
import { RelationEdge } from './RelationEdge'
import { HelperLines } from './HelperLines'

export interface ErdCanvasProps {
  /** The normalized schema to render (parse.schema ?? parse.lastValidSchema). */
  schema?: DbmlSchema
  /** Persisted positions to reconcile in (project.layout.positions). */
  savedPositions?: LayoutPositions
  /** Manual edge paths to render (project.layout.edges). */
  edgePaths?: EdgePaths
  /** Fired when manual edge paths change (drag commit, reset, auto-arrange clear). */
  onEdgePathsChange?: (next: EdgePaths) => void
  /** Fired on drag-stop (and Auto-arrange) with the FULL layout to persist. */
  onLayoutChange?: (layout: StoredLayout) => void
  /**
   * Fired ONCE after mount with the live capture handle:
   * - fitView: imperative re-fit (the initial-only fitView prop is not enough)
   * - getInstance: () => the React Flow instance (getNodes/getNodesBounds)
   * pages/editor stores these in refs and feeds export-diagram. NEW in Plan 5.
   */
  onCaptureReady?: (handle: ErdCaptureHandle) => void
  /**
   * Current canvas selection (node or edge). Drives node ring, active edges,
   * column highlights, edge handles — positions are never touched.
   */
  selection?: CanvasSelection
  /** Fires on node/edge click (union) and on pane click (null). */
  onSelect?: (selection: CanvasSelection) => void
  /** Fired (guarded by value-equality) with coordinate info for the selection. */
  onSelectionInfo?: (info: SelectionInfo | null) => void
}

export interface ErdCaptureHandle {
  fitView: () => void
  getInstance: () => Pick<ReactFlowInstance, 'getNodes' | 'getNodesBounds'>
  /** Info 패널 좌표 편집: 절대좌표를 받아 노드를 이동하고 레이아웃을 커밋한다. */
  setNodePositionAbs: (nodeId: string, pos: XYPosition) => void
  /** Info 패널 꺾임점 축 편집 — 현재 선택된 엣지에만 유효 (reportedPath 기반). */
  setEdgeWaypoint: (edgeId: string, vertexIndex: number, axis: 'x' | 'y', value: number) => void
  /** Reset line — 수동 경로 제거. */
  resetEdgePath: (edgeId: string) => void
}

/**
 * STABLE structural signature of a schema. parseDbml returns a brand-new
 * object on every successful parse (no memoization), so two structurally
 * IDENTICAL schemas have different object identities. Keying the layout memo
 * on this signature (instead of identity) means a no-op edit — whitespace, a
 * comment, type-then-delete — yields the SAME key and so does NOT trigger a
 * dagre relayout / viewport re-fit. JSON.stringify is cheap relative to a
 * relayout; the empty schema maps to '' so the empty case is stable too.
 */
export function schemaSignature(schema: DbmlSchema | undefined): string {
  return schema ? JSON.stringify(schema) : ''
}

// Stable type maps — defined at module scope so React Flow does not warn
// about new nodeTypes/edgeTypes object identities on every render.
const nodeTypes: NodeTypes = {
  table: TableNode,
  enum: EnumNode,
  sticky: StickyNote,
  group: GroupNode,
}
const edgeTypes: EdgeTypes = {
  relation: RelationEdge,
}

interface ErdCanvasInnerProps extends ErdCanvasProps {
  // RefObject<T | null> matches useRef<T>(null)'s type under @types/react 19.
  containerRef: RefObject<HTMLDivElement | null>
}

// ── Selection helpers ───────────────────────────────────────────────────────

/**
 * Compute the set of column handle ids that are highlighted when `tableName`
 * is selected. Covers BOTH endpoints of every ref that involves the table.
 */
function computeHighlightColIds(
  schema: DbmlSchema | undefined,
  tableName: string | null | undefined,
): Set<string> {
  if (!schema || !tableName) return new Set()
  const ids = new Set<string>()
  for (const ref of schema.refs) {
    const fromMatch = ref.fromTable === tableName
    const toMatch = ref.toTable === tableName
    if (fromMatch || toMatch) {
      for (const col of ref.fromColumns) {
        ids.add(`${ref.fromSchema}.${ref.fromTable}.${col}`)
      }
      for (const col of ref.toColumns) {
        ids.add(`${ref.toSchema}.${ref.toTable}.${col}`)
      }
    }
  }
  return ids
}

/**
 * Compute the set of edge ids that are active when `tableName` is selected.
 * Edge ids follow the `${ref.id}#${i}` pattern from schemaToFlow.
 */
function computeActiveEdgeIds(
  schema: DbmlSchema | undefined,
  tableName: string | null | undefined,
): Set<string> {
  if (!schema || !tableName) return new Set()
  const ids = new Set<string>()
  for (const ref of schema.refs) {
    if (ref.fromTable === tableName || ref.toTable === tableName) {
      const pairCount = Math.min(ref.fromColumns.length, ref.toColumns.length)
      for (let i = 0; i < pairCount; i++) {
        ids.add(`${ref.id}#${i}`)
      }
    }
  }
  return ids
}

/**
 * Zoom control bar — bottom-left per spec. Reads zoom via useViewport; drives
 * zoomIn/zoomOut/fitView via useReactFlow.
 */
function ZoomBar() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const { zoom } = useViewport()
  const pct = Math.round(zoom * 100)

  const btnStyle: React.CSSProperties = {
    width: 30,
    height: 30,
    border: 'none',
    background: 'transparent',
    color: 'var(--erd-text-2)',
    borderRadius: 7,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 80ms ease, color 80ms ease',
    flexShrink: 0,
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 4,
        background: 'var(--erd-surface)',
        border: '1px solid var(--erd-border)',
        borderRadius: 10,
        boxShadow: 'var(--erd-shadow-sm)',
      }}
      className="erd-zoombar"
    >
      <button
        style={btnStyle}
        title="Zoom in"
        onClick={() => zoomIn({ duration: 200 })}
        onMouseOver={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background =
            'var(--erd-hover)'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--erd-text)'
        }}
        onMouseOut={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLButtonElement).style.color =
            'var(--erd-text-2)'
        }}
      >
        <Plus size={16} strokeWidth={2} />
      </button>
      <button
        style={btnStyle}
        title="Zoom out"
        onClick={() => zoomOut({ duration: 200 })}
        onMouseOver={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background =
            'var(--erd-hover)'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--erd-text)'
        }}
        onMouseOut={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLButtonElement).style.color =
            'var(--erd-text-2)'
        }}
      >
        <Minus size={16} strokeWidth={2} />
      </button>
      <span
        style={{
          fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
          fontSize: 11,
          color: 'var(--erd-text-2)',
          padding: '0 8px',
          minWidth: 42,
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        {pct}%
      </span>
      <button
        style={btnStyle}
        title="Fit to screen"
        onClick={() => fitView({ padding: 0.1, duration: 200 })}
        onMouseOver={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background =
            'var(--erd-hover)'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--erd-text)'
        }}
        onMouseOut={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLButtonElement).style.color =
            'var(--erd-text-2)'
        }}
      >
        <Maximize2 size={16} strokeWidth={2} />
      </button>
    </div>
  )
}

function ErdCanvasInner({ schema, savedPositions, edgePaths, onEdgePathsChange, onLayoutChange, onCaptureReady, containerRef, selection, onSelect, onSelectionInfo }: ErdCanvasInnerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [helperLines, setHelperLines] = useState<{ vertical?: number; horizontal?: number }>({})
  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [containerRef])

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current?.requestFullscreen().catch(() => {})
    }
  }
  // STABLE structural signature (NOT schema identity) so a no-op edit does
  // not re-run schemaToFlow + reconcile and re-seed the nodes.
  const schemaKey = useMemo(() => schemaSignature(schema), [schema])
  // STABLE serialized positions key so an unstable savedPositions identity
  // does NOT re-run reconcile and clobber an in-flight drag.
  const positionsKey = useMemo(
    () => JSON.stringify(savedPositions ?? {}),
    [savedPositions],
  )

  // Compute schemaToFlow ONCE per structural change; share its nodes+edges.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const flow = useMemo(
    () => (schema ? schemaToFlow(schema) : { nodes: [], edges: [] }),
    [schemaKey],
  )

  // Reconcile saved positions into freshly-parsed nodes (Block A, by node id).
  // Keyed on schemaKey + positionsKey only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reconciledNodes = useMemo(() => {
    return reconcileLayout(flow.nodes, flow.edges, savedPositions ?? {})
  }, [flow, positionsKey])

  const edges = useMemo(() => flow.edges, [flow])

  const [nodes, setNodes, onNodesChange] = useNodesState<ErdFlowNode>([])

  // Push reconciled nodes into state ONLY when the derived input changes —
  // NOT every render. useNodesState preserves live drags across unrelated
  // re-renders; this effect re-seeds only on a real schema/positions change.
  useEffect(() => {
    setNodes(reconciledNodes)
  }, [reconciledNodes, setNodes])

  // Read the LATEST nodes at drag-stop without a stale closure.
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  // Latest values for the stable edge-path context callbacks (no stale closures).
  const edgePathsRef = useRef<EdgePaths>(edgePaths ?? {})
  edgePathsRef.current = edgePaths ?? {}
  const flowEdgeIdsRef = useRef<Set<string>>(new Set())
  flowEdgeIdsRef.current = new Set(flow.edges.map((e) => e.id))
  const onEdgePathsChangeRef = useRef(onEdgePathsChange)
  onEdgePathsChangeRef.current = onEdgePathsChange

  // Rendered full polyline of the SELECTED edge, reported by RelationEdge.
  // Drives SelectionInfo waypoints and panel edits on auto-routed edges.
  const [reportedPath, setReportedPath] = useState<{
    id: string
    points: PathPoint[]
  } | null>(null)
  const reportedPathRef = useRef(reportedPath)
  reportedPathRef.current = reportedPath

  // Commit prunes orphans (edges that no longer exist) per ADR-0012.
  const edgePathCtx = useMemo<EdgePathContextValue>(
    () => ({
      commitWaypoints: (edgeId, waypoints) => {
        const rounded = waypoints.map((p) => ({
          x: Math.round(p.x),
          y: Math.round(p.y),
        }))
        // Spread the existing entry so a stored side swap survives a path edit.
        onEdgePathsChangeRef.current?.(
          pruneEdgePaths(
            {
              ...edgePathsRef.current,
              [edgeId]: { ...edgePathsRef.current[edgeId], waypoints: rounded },
            },
            flowEdgeIdsRef.current,
          ),
        )
      },
      resetPath: (edgeId) => {
        // Reset line drops the WAYPOINTS only — an anchor-side swap is a
        // separate user choice and stays until swapped back.
        const next = { ...edgePathsRef.current }
        const { sourceSide, targetSide } = next[edgeId] ?? {}
        if (sourceSide || targetSide) {
          next[edgeId] = {
            ...(sourceSide && { sourceSide }),
            ...(targetSide && { targetSide }),
          }
        } else {
          delete next[edgeId]
        }
        onEdgePathsChangeRef.current?.(
          pruneEdgePaths(next, flowEdgeIdsRef.current),
        )
      },
      setEdgeSide: (edgeId, end, side) => {
        const next = { ...edgePathsRef.current }
        const entry = applyEdgeSide(next[edgeId], end, side)
        if (entry) next[edgeId] = entry
        else delete next[edgeId]
        onEdgePathsChangeRef.current?.(
          pruneEdgePaths(next, flowEdgeIdsRef.current),
        )
      },
      reportPath: (edgeId, points) => {
        setReportedPath((prev) =>
          prev?.id === edgeId && JSON.stringify(prev.points) === JSON.stringify(points)
            ? prev
            : { id: edgeId, points },
        )
      },
    }),
    [],
  )

  const groupActionCtx = useMemo<GroupActionContextValue>(
    () => ({
      onArrangeGroup: (groupId) => {
        const current = nodesRef.current
        const movedMemberIds = new Set(
          current.filter((n) => n.parentId === groupId).map((n) => n.id),
        )
        if (movedMemberIds.size === 0) return
        const next = arrangeGroupInPlace(current, groupId)
        setNodes(next)
        onLayoutChange?.(nodesToLayout(next))
        // 이동 멤버에 닿는 엣지(한쪽 끝점이라도)의 수동 경로만 제거 (CONTEXT.md 수동경로 그룹별 예외).
        const paths = edgePathsRef.current
        const survivors: typeof paths = {}
        let changed = false
        for (const [edgeId, path] of Object.entries(paths)) {
          const e = flow.edges.find((x) => x.id === edgeId)
          const touches = e && (movedMemberIds.has(e.source) || movedMemberIds.has(e.target))
          if (touches) changed = true
          else survivors[edgeId] = path
        }
        if (changed) onEdgePathsChangeRef.current?.(pruneEdgePaths(survivors, flowEdgeIdsRef.current))
      },
    }),
    [flow.edges, onLayoutChange, setNodes],
  )

  const rf = useReactFlow()
  const { fitView } = rf

  function setNodePositionAbsImpl(nodeId: string, pos: XYPosition) {
    const current = nodesRef.current
    const node = current.find((n) => n.id === nodeId)
    if (!node || node.type === 'group') return // 그룹 박스는 파생 — 편집 불가 (Q3)
    let rel = pos
    if (node.parentId) {
      const parent = current.find((n) => n.id === node.parentId)
      if (parent) rel = { x: pos.x - parent.position.x, y: pos.y - parent.position.y }
    }
    const next = current.map((n) =>
      n.id === nodeId
        ? { ...n, position: { x: Math.round(rel.x), y: Math.round(rel.y) } }
        : n,
    )
    setNodes(next)
    onLayoutChange?.(nodesToLayout(next))
  }
  function setEdgeWaypointImpl(
    edgeId: string,
    vertexIndex: number,
    axis: 'x' | 'y',
    value: number,
  ) {
    const rp = reportedPathRef.current
    if (!rp || rp.id !== edgeId) return
    // 패널 편집 = 축을 소유한 인접 세그먼트의 드래그 (캔버스 드래그와 동일 의미).
    // 자동 경로 엣지를 편집하면 이 커밋으로 수동 경로가 된다 (Q3 결정).
    edgePathCtx.commitWaypoints(edgeId, editVertexAxis(rp.points, vertexIndex, axis, value))
  }
  const setNodePositionAbsRef = useRef(setNodePositionAbsImpl)
  setNodePositionAbsRef.current = setNodePositionAbsImpl
  const setEdgeWaypointRef = useRef(setEdgeWaypointImpl)
  setEdgeWaypointRef.current = setEdgeWaypointImpl

  // Surface the capture handle to pages/editor exactly once the instance is
  // live. getInstance returns a closure over rf; pages/editor reads the viewport
  // ELEMENT via its own wrapper ref (not through this handle). NEW in Plan 5.
  // The fired flag ensures the callback fires only once even if deps change.
  const captureReadyFiredRef = useRef(false)
  useEffect(() => {
    if (captureReadyFiredRef.current) return
    captureReadyFiredRef.current = true
    onCaptureReady?.({
      fitView,
      getInstance: () => rf,
      setNodePositionAbs: (nodeId, pos) => setNodePositionAbsRef.current(nodeId, pos),
      setEdgeWaypoint: (edgeId, i, axis, v) => setEdgeWaypointRef.current(edgeId, i, axis, v),
      resetEdgePath: (edgeId) => edgePathCtx.resetPath(edgeId),
    })
  }, [fitView, rf, onCaptureReady, edgePathCtx])

  function handleAutoArrange() {
    // Discard ALL saved positions: reconcile with an EMPTY set => pure dagre.
    const dagreNodes = reconcileLayout(flow.nodes, flow.edges, {})
    setNodes(dagreNodes)
    onLayoutChange?.(nodesToLayout(dagreNodes))
    // Auto-arrange recomputes every position — stale manual paths are cleared (ADR-0012).
    onEdgePathsChange?.({})
    // Re-fit after measurement lands (v12 fitView is initial-only otherwise).
    requestAnimationFrame(() => fitView({ padding: 0.1, duration: 200 }))
  }

  // ── Phase 5: Selection-derived visual overlays ────────────────────────────
  // Derive the legacy table-name + the selected edge id from the union.
  const selectedTableName =
    selection?.kind === 'node' && selection.nodeType === 'table'
      ? selection.tableName ?? null
      : null
  const selectedEdgeId = selection?.kind === 'edge' ? selection.edgeId : null

  // Computed from schema (NOT from nodes state) so positions are never touched.
  const highlightColIds = useMemo(
    () => computeHighlightColIds(schema, selectedTableName),
    [schema, selectedTableName],
  )
  const activeEdgeIds = useMemo(
    () => computeActiveEdgeIds(schema, selectedTableName),
    [schema, selectedTableName],
  )

  // Derive display nodes: inject isSelected + highlightedColumnIds into data.
  // Base `nodes` (useNodesState) remain authoritative for positions; we never
  // modify them here — only produce a derived view for rendering.
  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        if (n.type !== 'table') return n
        const data = n.data as TableNodeData
        return {
          ...n,
          data: {
            ...data,
            isSelected: data.tableName === selectedTableName,
            highlightedColumnIds: data.columns
              .filter((c: ErdColumn) => highlightColIds.has(c.id))
              .map((c: ErdColumn) => c.id),
          },
        }
      }),
    [nodes, selectedTableName, highlightColIds],
  )

  // Absolute X of every node (grouped members = parent origin + relative), used
  // to pick FK edge anchor sides by geometry below.
  const nodeAbsX = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const m = new Map<string, number>()
    for (const n of nodes) {
      const parent = n.parentId ? byId.get(n.parentId) : undefined
      m.set(n.id, (parent ? parent.position.x : 0) + n.position.x)
    }
    return m
  }, [nodes])

  // Derive display edges: inject `active` flag + stored manual waypoints, and
  // choose each FK edge's anchor SIDES by geometry (resolveEdgeSides): handles
  // are fixed (FK left / PK right), so when auto-layout places an FK table left
  // of its PK table the edge would wrap around to reach the left handle and
  // multiple such edges share one gutter → they merge into a single visible
  // line. Flipping to the table's alternate-side handle (`@left` source /
  // `@right` target) makes the edge take the short FACING path instead, so
  // distinct relationships stay distinct. A stored manual swap wins over
  // geometry; enum links keep the default sides.
  const displayEdges = useMemo(
    () =>
      edges.map((e) => {
        const stored = edgePaths?.[e.id]
        const isEnumLink = (e.data as { isEnumLink?: boolean } | undefined)?.isEnumLink
        let sourceHandle = e.sourceHandle
        let targetHandle = e.targetHandle
        if (!isEnumLink && e.sourceHandle && e.targetHandle) {
          const { sourceSide, targetSide } = resolveEdgeSides(
            nodeAbsX.get(e.source) ?? 0,
            nodeAbsX.get(e.target) ?? 0,
            stored,
          )
          if (sourceSide === 'left') sourceHandle = `${e.sourceHandle}@left`
          if (targetSide === 'right') targetHandle = `${e.targetHandle}@right`
        }
        return {
          ...e,
          ...(sourceHandle !== e.sourceHandle && { sourceHandle }),
          ...(targetHandle !== e.targetHandle && { targetHandle }),
          data: {
            ...e.data,
            active: activeEdgeIds.has(e.id),
            waypoints: stored?.waypoints,
            isEdgeSelected: e.id === selectedEdgeId,
          },
        }
      }),
    [edges, activeEdgeIds, edgePaths, selectedEdgeId, nodeAbsX],
  )

  // Report coordinate info for the current selection — value-equality guarded
  // so identical re-computations don't loop the page state.
  const lastInfoKeyRef = useRef('')
  useEffect(() => {
    if (!onSelectionInfo) return
    let info: SelectionInfo | null = null
    if (selection?.kind === 'edge') {
      const e = flow.edges.find((x) => x.id === selection.edgeId)
      if (e) {
        const part = (h: string | null | undefined, fallback: string) =>
          (h ?? fallback).split('.').slice(1).join('.') || (h ?? fallback)
        const rp = reportedPath && reportedPath.id === e.id ? reportedPath.points : null
        const stored = edgePaths?.[e.id]?.waypoints
        const interior = rp ? rp.slice(1, -1) : stored ?? []
        info = {
          kind: 'edge',
          edgeId: e.id,
          label: `${part(e.sourceHandle, e.source)} → ${part(e.targetHandle, e.target)}`,
          manual: !!stored,
          waypoints: interior.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
        }
      }
    } else if (selection?.kind === 'node') {
      const n = nodes.find((x) => x.id === selection.nodeId)
      if (n) {
        const parent = n.parentId ? nodes.find((x) => x.id === n.parentId) : undefined
        const abs = parent
          ? { x: parent.position.x + n.position.x, y: parent.position.y + n.position.y }
          : n.position
        const d = n.data as Record<string, unknown>
        info = {
          kind: 'node',
          nodeId: n.id,
          nodeType: selection.nodeType,
          label: String(d.tableName ?? d.enumName ?? d.title ?? n.id),
          x: Math.round(abs.x),
          y: Math.round(abs.y),
        }
      }
    }
    const key = JSON.stringify(info)
    if (key !== lastInfoKeyRef.current) {
      lastInfoKeyRef.current = key
      onSelectionInfo(info)
    }
  }, [selection, nodes, flow.edges, edgePaths, reportedPath, onSelectionInfo])

  // Secondary button style (spec: --erd-surface bg, 1px --erd-border-2, radius 8)
  const secondaryBtnStyle: React.CSSProperties = {
    fontFamily: 'inherit',
    fontWeight: 500,
    fontSize: 13,
    lineHeight: 1,
    border: '1px solid var(--erd-border-2)',
    background: 'var(--erd-surface)',
    color: 'var(--erd-text)',
    borderRadius: 8,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '8px 12px',
    transition: 'background 80ms ease, border-color 80ms ease',
    boxShadow: 'var(--erd-shadow-sm)',
  }

  return (
    <EdgePathContext.Provider value={edgePathCtx}>
    <GroupActionContext.Provider value={groupActionCtx}>
    <EdgeRoutesProvider>
    <ReactFlow
      nodes={displayNodes}
      edges={displayEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeDrag={(_, node) => {
        const r = getHelperLines(node, nodesRef.current.filter((n) => n.id !== node.id))
        setHelperLines({ vertical: r.vertical, horizontal: r.horizontal })
        if (r.snapX !== undefined || r.snapY !== undefined) {
          setNodes((ns) =>
            ns.map((n) =>
              n.id === node.id
                ? { ...n, position: { x: r.snapX ?? n.position.x, y: r.snapY ?? n.position.y } }
                : n,
            ),
          )
        }
      }}
      onNodeDragStop={() => {
        setHelperLines({})
        onLayoutChange?.(nodesToLayout(nodesRef.current))
      }}
      onNodeClick={(_, node) => {
        if (node.type === 'table') {
          onSelect?.({
            kind: 'node',
            nodeId: node.id,
            nodeType: 'table',
            tableName: (node.data as TableNodeData).tableName,
          })
        } else if (node.type === 'enum' || node.type === 'sticky') {
          onSelect?.({ kind: 'node', nodeId: node.id, nodeType: node.type })
        }
      }}
      onEdgeClick={(_, edge) => {
        if ((edge.data as RelationEdgeData | undefined)?.isEnumLink) return
        onSelect?.({ kind: 'edge', edgeId: edge.id })
      }}
      onPaneClick={() => onSelect?.(null)}
      nodesConnectable={false}
      deleteKeyCode={null}
      // 캔버스 이동은 휠(가운데) 클릭 드래그로만. 좌클릭 드래그는 패닝에서 제외해
      // 선 이동·세그먼트 핸들·Reset/스왑 버튼 클릭을 가로채지 않게 한다. (panOnDrag
      // 의 숫자 배열 = 패닝을 시작하는 마우스 버튼: 0=좌, 1=가운데, 2=우 → [1] 만.)
      panOnDrag={[1]}
      selectionOnDrag={false}
      fitView
      minZoom={0.2}
      proOptions={{ hideAttribution: true }}
      style={{ background: 'var(--erd-canvas)' }}
    >
      <HelperLines vertical={helperLines.vertical} horizontal={helperLines.horizontal} />

      {/* 배경 격자 없음 — 관계선이 격자선과 헷갈리지 않도록 평면 캔버스(--erd-canvas)만
          사용한다. (이전: 16/80px 모눈종이 Background 2겹 — 사용자 요청으로 제거) */}

      {/* Top-right controls panel */}
      <Panel position="top-right">
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            style={secondaryBtnStyle}
            onClick={handleAutoArrange}
            onMouseOver={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background =
                'var(--erd-hover)'
            }}
            onMouseOut={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background =
                'var(--erd-surface)'
            }}
          >
            <Grid2x2 size={15} strokeWidth={2} />
            Auto-arrange
          </button>
          <button
            style={{ ...secondaryBtnStyle, padding: 8 }}
            aria-label="Toggle fullscreen"
            onClick={toggleFullscreen}
            onMouseOver={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background =
                'var(--erd-hover)'
            }}
            onMouseOut={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background =
                'var(--erd-surface)'
            }}
          >
            {isFullscreen ? <Minimize size={16} strokeWidth={2} /> : <Maximize size={16} strokeWidth={2} />}
          </button>
        </div>
      </Panel>

      {/* Bottom-left zoom bar */}
      <Panel position="bottom-left">
        <ZoomBar />
      </Panel>
    </ReactFlow>
    </EdgeRoutesProvider>
    </GroupActionContext.Provider>
    </EdgePathContext.Provider>
  )
}

/**
 * React Flow ERD canvas (Phase 4 restyle). Maps a normalized DbmlSchema to
 * nodes/edges via the pure entities/erd adapter, then reconciles `savedPositions`
 * into controlled node state by name (ADR-0004): dagre runs only on a structural
 * parse change, not every render, and placed tables keep their saved coords.
 * Renders Backstage-spec table/enum/sticky/group nodes + crow-foot relation edges.
 * Canvas bg uses --erd-canvas, layered grid bg, custom zoom bar (bottom-left),
 * Auto-arrange button (top-right). fitView/fullscreen/capture handle preserved.
 * features layer: depends on shared + entities/dbml + entities/erd +
 * entities/layout + @xyflow/react (FSD downward imports).
 */
function ErdCanvasComponent({ schema, savedPositions, edgePaths, onEdgePathsChange, onLayoutChange, onCaptureReady, selection, onSelect, onSelectionInfo }: ErdCanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  if (!schema || schema.tables.length === 0) {
    return (
      <div
        data-testid="erd-canvas-empty"
        style={{
          display: 'flex',
          height: '100%',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
          border: '1px dashed var(--erd-border)',
          fontSize: 13,
          color: 'var(--erd-text-3)',
          background: 'var(--erd-canvas)',
        }}
      >
        No diagram yet — start typing DBML.
      </div>
    )
  }
  return (
    <div
      data-testid="erd-canvas"
      ref={rootRef}
      style={{
        height: '100%',
        width: '100%',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--erd-canvas)',
      }}
    >
      <ReactFlowProvider>
        <ErdCanvasInner
          schema={schema}
          savedPositions={savedPositions}
          edgePaths={edgePaths}
          onEdgePathsChange={onEdgePathsChange}
          onLayoutChange={onLayoutChange}
          onCaptureReady={onCaptureReady}
          containerRef={rootRef}
          selection={selection}
          onSelect={onSelect}
          onSelectionInfo={onSelectionInfo}
        />
      </ReactFlowProvider>
    </div>
  )
}

// Memo boundary: page-level selectionInfo churn during edge drags must not
// re-render the canvas (all props are referentially stable mid-drag). Exported
// as a thin function wrapper (not the bare memo object) so the page render
// passes identical props straight through to the memo — which bails out the
// heavy ReactFlow subtree — while keeping the named export a plain function
// that consumers can spy on (vi.spyOn refuses a memo object).
const MemoErdCanvas = memo(ErdCanvasComponent)
export function ErdCanvas(props: ErdCanvasProps) {
  return <MemoErdCanvas {...props} />
}
