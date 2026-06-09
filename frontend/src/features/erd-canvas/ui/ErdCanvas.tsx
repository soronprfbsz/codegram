import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Panel,
  useNodesState,
  useReactFlow,
  type NodeTypes,
  type EdgeTypes,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Maximize, Minimize } from 'lucide-react'
import type { DbmlSchema } from '@/entities/dbml'
import { schemaToFlow, type ErdFlowNode } from '@/entities/erd'
import {
  reconcileLayout,
  nodesToLayout,
  type LayoutPositions,
  type StoredLayout,
} from '@/entities/layout'
import { Button } from '@/shared/ui/button'
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
    >
      <Panel position="top-right">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleAutoArrange}>
            Auto-arrange
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Toggle fullscreen"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize /> : <Maximize />}
          </Button>
        </div>
      </Panel>
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

/**
 * React Flow ERD canvas (Plan 4 manual layout). Maps a normalized DbmlSchema to
 * nodes/edges via the pure entities/erd adapter, then reconciles `savedPositions`
 * into controlled node state by name (ADR-0004): dagre runs only on a structural
 * parse change, not every render, and placed tables keep their saved coords.
 * Renders custom table/enum/sticky/group nodes + crow-foot relation edges. A
 * table drag persists via onNodeDragStop -> onLayoutChange; the Auto-arrange
 * action discards saved positions and re-runs dagre for every node. When no
 * schema is given (initial/empty), shows a placeholder.
 * features layer: depends on shared + entities/dbml + entities/erd +
 * entities/layout + @xyflow/react (FSD downward imports).
 */
export function ErdCanvas({ schema, savedPositions, onLayoutChange, onCaptureReady }: ErdCanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  if (!schema || schema.tables.length === 0) {
    return (
      <div
        data-testid="erd-canvas-empty"
        className="flex h-full w-full items-center justify-center rounded border border-dashed border-gray-300 text-sm text-gray-500"
      >
        No diagram yet — start typing DBML.
      </div>
    )
  }
  return (
    <div data-testid="erd-canvas" ref={rootRef} className="h-full w-full rounded border">
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
