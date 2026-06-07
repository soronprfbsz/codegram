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
  // Pure adapter + dagre layout, recomputed only when the schema reference
  // changes (i.e. per successful parse). No persistence in 3b — positions are
  // auto-computed every time and never saved (that is Plan 4).
  const { nodes, edges } = useMemo(() => {
    if (!schema) return { nodes: [], edges: [] }
    const flow = schemaToFlow(schema)
    return { nodes: autoLayout(flow.nodes, flow.edges), edges: flow.edges }
  }, [schema])

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
