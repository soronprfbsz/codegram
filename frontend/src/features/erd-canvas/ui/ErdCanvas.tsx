import { useEffect, useMemo, useRef } from 'react'
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
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
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

function ErdCanvasInner({ schema, savedPositions, onLayoutChange }: ErdCanvasProps) {
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
    const next = reconcileLayout(flow.nodes, flow.edges, savedPositions ?? {})
    // Group containers are layout output (position + size recomputed each
    // parse); Plan 4 never persists them, so they must not be dragged.
    return next.map((n) =>
      n.type === 'group' ? { ...n, draggable: false } : n,
    )
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

  const { fitView } = useReactFlow()

  function handleAutoArrange() {
    // Discard ALL saved positions: reconcile with an EMPTY set => pure dagre.
    const dagreNodes = reconcileLayout(flow.nodes, flow.edges, {}).map((n) =>
      n.type === 'group' ? { ...n, draggable: false } : n,
    )
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
      proOptions={{ hideAttribution: true }}
    >
      <Panel position="top-right">
        <Button variant="outline" size="sm" onClick={handleAutoArrange}>
          Auto-arrange
        </Button>
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
export function ErdCanvas({ schema, savedPositions, onLayoutChange }: ErdCanvasProps) {
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
    <div data-testid="erd-canvas" className="h-full w-full rounded border">
      <ReactFlowProvider>
        <ErdCanvasInner
          schema={schema}
          savedPositions={savedPositions}
          onLayoutChange={onLayoutChange}
        />
      </ReactFlowProvider>
    </div>
  )
}
