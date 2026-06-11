/**
 * Persisted-layout types (Plan 4). These describe the versioned object stored in
 * `project.layout` JSONB and round-tripped through the Plan 2 autosave path.
 *
 * Keys are React Flow node ids. Because schemaToFlow ids nodes by name
 * (table = `${schema}.${name}`, enum = `enum:${schema}.${name}`,
 * note = `note:${name}`, group = `group:${name}`), keying positions by node id
 * IS keying by name (ADR-0004): a rename changes the id, so the old entry no
 * longer matches and the node is treated as new (loses its position).
 *
 * entities layer: imports only the React Flow XYPosition TYPE (like entities/erd).
 * No JSX, no hooks, no React Flow runtime (FSD downward imports).
 */
import type { XYPosition } from '@xyflow/react' // TYPE-ONLY import (like entities/erd)

/**
 * One persisted node position. `parentId` is present ONLY for grouped members,
 * recording the group node id the RELATIVE coords were saved under (frame guard:
 * relative coords are valid only under the same parent group). Ungrouped nodes
 * store ABSOLUTE coords and omit `parentId`.
 *
 * XYPosition is `{ x: number; y: number }` in @xyflow/react; StoredPosition is
 * deliberately its own type (adds optional parentId) rather than aliasing it.
 */
export interface StoredPosition {
  x: number
  y: number
  /** Group node id this position is relative to, if the node was grouped at save time. */
  parentId?: string
}

/** Map of node id -> persisted position. Node id == ADR-0004 name key. */
export type LayoutPositions = Record<string, StoredPosition>

/** Which side of its table an edge endpoint anchors to. */
export type EdgeSide = 'left' | 'right'

/**
 * One manual edge path (ADR-0012): interior bend vertices in ABSOLUTE canvas
 * coords. Endpoints are NOT stored — they anchor to the column handles live,
 * so a table move stretches the end segments instead of detaching them.
 * `sourceSide`/`targetSide` override the DEFAULT anchor sides (source exits
 * RIGHT, target enters LEFT) — stored only when non-default, so an entry may
 * carry sides without waypoints (side swapped, path still auto-routed).
 */
export interface StoredEdgePath {
  waypoints?: XYPosition[]
  sourceSide?: EdgeSide
  targetSide?: EdgeSide
}

/** Map of edge id -> manual path. Edge id == schemaToFlow's `${ref.id}#${i}`
 *  (name-based, so ADR-0004 keep/lose rules apply unchanged). */
export type EdgePaths = Record<string, StoredEdgePath>

/** The versioned object stored in project.layout JSONB. */
export interface StoredLayout {
  version: 1
  positions: LayoutPositions
  /** Manual edge paths (ADR-0012). Absent/empty = every edge auto-routed. */
  edges?: EdgePaths
}

/** Re-exported for callers that want the React Flow position shape. */
export type { XYPosition }
