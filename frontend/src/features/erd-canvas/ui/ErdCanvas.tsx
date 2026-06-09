import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Panel,
  useNodesState,
  useReactFlow,
  useViewport,
  type NodeTypes,
  type EdgeTypes,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Maximize, Minimize, Grid2x2, Plus, Minus, Maximize2 } from 'lucide-react'
import type { DbmlSchema } from '@/entities/dbml'
import { schemaToFlow, type ErdFlowNode } from '@/entities/erd'
import {
  reconcileLayout,
  nodesToLayout,
  type LayoutPositions,
  type StoredLayout,
} from '@/entities/layout'
import { TableNode } from './TableNode'
import { EnumNode } from './EnumNode'
import { StickyNote } from './StickyNote'
import { GroupNode } from './GroupNode'
import { RelationEdge } from './RelationEdge'

export interface ErdCanvasProps {
  /** The normalized schema to render (parse.schema ?? parse.lastValidSchema). */
  schema?: DbmlSchema
  /** Persisted positions to reconcile in (project.layout.positions). */
  savedPositions?: LayoutPositions
  /** Fired on drag-stop (and Auto-arrange) with the FULL layout to persist. */
  onLayoutChange?: (layout: StoredLayout) => void
  /**
   * Fired ONCE after mount with the live capture handle:
   * - fitView: imperative re-fit (the initial-only fitView prop is not enough)
   * - getInstance: () => the React Flow instance (getNodes/getNodesBounds)
   * pages/editor stores these in refs and feeds export-diagram. NEW in Plan 5.
   */
  onCaptureReady?: (handle: ErdCaptureHandle) => void
}

export interface ErdCaptureHandle {
  fitView: () => void
  getInstance: () => Pick<ReactFlowInstance, 'getNodes' | 'getNodesBounds'>
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

function ErdCanvasInner({ schema, savedPositions, onLayoutChange, onCaptureReady, containerRef }: ErdCanvasInnerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
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

  const rf = useReactFlow()
  const { fitView } = rf

  // Surface the capture handle to pages/editor exactly once the instance is
  // live. getInstance returns a closure over rf; pages/editor reads the viewport
  // ELEMENT via its own wrapper ref (not through this handle). NEW in Plan 5.
  // The fired flag ensures the callback fires only once even if deps change.
  const captureReadyFiredRef = useRef(false)
  useEffect(() => {
    if (captureReadyFiredRef.current) return
    captureReadyFiredRef.current = true
    onCaptureReady?.({ fitView, getInstance: () => rf })
  }, [fitView, rf, onCaptureReady])

  function handleAutoArrange() {
    // Discard ALL saved positions: reconcile with an EMPTY set => pure dagre.
    const dagreNodes = reconcileLayout(flow.nodes, flow.edges, {})
    setNodes(dagreNodes)
    onLayoutChange?.(nodesToLayout(dagreNodes))
    // Re-fit after measurement lands (v12 fitView is initial-only otherwise).
    requestAnimationFrame(() => fitView({ padding: 0.1, duration: 200 }))
  }

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
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={() => onLayoutChange?.(nodesToLayout(nodesRef.current))}
      nodesConnectable={false}
      deleteKeyCode={null}
      fitView
      minZoom={0.2}
      proOptions={{ hideAttribution: true }}
      style={{ background: 'var(--erd-canvas)' }}
    >
      {/* Two-layer Background: minor 24px grid + major 120px grid */}
      <Background
        variant={BackgroundVariant.Lines}
        gap={24}
        color="var(--erd-grid)"
        style={{ opacity: 1 }}
      />
      <Background
        variant={BackgroundVariant.Lines}
        gap={120}
        color="var(--erd-grid-strong)"
        style={{ opacity: 1 }}
      />

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
export function ErdCanvas({ schema, savedPositions, onLayoutChange, onCaptureReady }: ErdCanvasProps) {
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
          onLayoutChange={onLayoutChange}
          onCaptureReady={onCaptureReady}
          containerRef={rootRef}
        />
      </ReactFlowProvider>
    </div>
  )
}
