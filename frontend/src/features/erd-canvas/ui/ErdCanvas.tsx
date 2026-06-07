import { useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { DbmlSchema } from '@/entities/dbml'
import { schemaToFlow, autoLayout } from '@/entities/erd'
import { TableNode } from './TableNode'
import { EnumNode } from './EnumNode'
import { StickyNote } from './StickyNote'
import { GroupNode } from './GroupNode'
import { RelationEdge } from './RelationEdge'

export interface ErdCanvasProps {
  /** The normalized schema to render (parse.schema ?? parse.lastValidSchema). */
  schema?: DbmlSchema
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

function ErdCanvasInner({ schema }: ErdCanvasProps) {
  // STABLE structural signature (NOT the schema object identity) so a no-op
  // edit does not re-run schemaToFlow + dagre and re-fit the viewport.
  const schemaKey = useMemo(() => schemaSignature(schema), [schema])

  // Pure adapter + dagre layout, recomputed only when the structural signature
  // changes. No persistence in 3b — positions are auto-computed and never
  // saved (that is Plan 4). Intentionally keyed on schemaKey, not schema.
  const { nodes, edges } = useMemo(() => {
    if (!schema) return { nodes: [], edges: [] }
    const flow = schemaToFlow(schema)
    return { nodes: autoLayout(flow.nodes, flow.edges), edges: flow.edges }
  }, [schemaKey])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesConnectable={false}
      deleteKeyCode={null}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

/**
 * Read-only React Flow ERD canvas (Plan 3b). Maps a normalized DbmlSchema to
 * nodes/edges via the pure entities/erd adapter, positions them with dagre
 * auto-layout on every render (NO persistence — Plan 4 adds saved layout),
 * and renders custom table/enum/sticky/group nodes + crow-foot relation
 * edges. Nodes may be dragged for viewing but positions are not saved. When
 * no schema is given (initial/empty), shows a placeholder.
 * features layer: depends on shared + entities/dbml + entities/erd +
 * @xyflow/react (FSD downward imports).
 */
export function ErdCanvas({ schema }: ErdCanvasProps) {
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
        <ErdCanvasInner schema={schema} />
      </ReactFlowProvider>
    </div>
  )
}
