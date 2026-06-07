/**
 * ERD view types (Plan 3b). These describe the `data` payloads the React Flow
 * custom nodes/edges receive and alias React Flow's Node/Edge generics so the
 * PURE schemaToFlow adapter (entities/erd/lib) can produce React-Flow-ready
 * shapes without importing the React Flow RUNTIME — only its TYPES.
 *
 * entities layer: imports only TYPES from @xyflow/react + entities/dbml types.
 * No JSX, no hooks, no side effects (FSD downward imports).
 */
import type { Node, Edge } from '@xyflow/react'
import type { DbmlRelation } from '@/entities/dbml'

/** Discriminator for the four custom React Flow node kinds. */
export type ErdNodeType = 'table' | 'enum' | 'sticky' | 'group'

/** A single column row rendered inside a TableNode, with its handle id. */
export interface ErdColumn {
  /** Handle id == DbmlColumn.id (`${schema}.${table}.${name}`). Edges anchor here. */
  id: string
  name: string
  type: string
  pk: boolean
  /** Foreign-key participant (DbmlColumn.isFk). */
  fk: boolean
  /** NOT NULL (DbmlColumn.notNull). */
  nn: boolean
  /** UNIQUE (DbmlColumn.unique). */
  unique: boolean
}

/** `data` for a TableNode: header + one row per column (each carries a handle id). */
export interface TableNodeData {
  /** Table display name. */
  tableName: string
  /** DbmlTable.id (`${schema}.${name}`) — node id, kept here for convenience. */
  tableId: string
  /** [headercolor: ...] hex when set. */
  headerColor?: string
  columns: ErdColumn[]
  [key: string]: unknown
}

/** `data` for an EnumNode: name + ordered value labels. */
export interface EnumNodeData {
  enumName: string
  values: string[]
  [key: string]: unknown
}

/** `data` for a StickyNote node: a read-only text card. */
export interface StickyNodeData {
  title: string
  content: string
  headerColor?: string
  [key: string]: unknown
}

/** `data` for a GroupNode: a colored background region behind its members. */
export interface GroupNodeData {
  groupName: string
  /** [color: ...] hex when set. */
  color?: string
  [key: string]: unknown
}

/** Union of every node `data` shape the canvas can render. */
export type ErdNodeData =
  | TableNodeData
  | EnumNodeData
  | StickyNodeData
  | GroupNodeData

/**
 * Per-endpoint crow-foot marker kind. 'one' renders a single bar; 'many'
 * renders the three-prong crow-foot. Derived from DbmlRef.relation per endpoint.
 */
export type RelationEndpointMarker = 'one' | 'many'

/** `data` carried by a RelationEdge so the custom edge can draw crow-foot markers. */
export interface RelationEdgeData {
  /** Ordered cardinality `${from}-${to}` straight from DbmlRef.relation. */
  relation: DbmlRelation
  /** Marker at the source (from) endpoint. */
  sourceMarker: RelationEndpointMarker
  /** Marker at the target (to) endpoint. */
  targetMarker: RelationEndpointMarker
  /** True for the dashed column→enum link edges (not an FK relationship). */
  isEnumLink?: boolean
  [key: string]: unknown
}

/** A React Flow node specialized to ERD node `data` shapes. */
export type ErdFlowNode = Node<ErdNodeData>

/** A React Flow edge specialized to ERD relation `data`. */
export type ErdFlowEdge = Edge<RelationEdgeData>

/** What the PURE schemaToFlow adapter returns. */
export interface ErdFlow {
  nodes: ErdFlowNode[]
  edges: ErdFlowEdge[]
}
