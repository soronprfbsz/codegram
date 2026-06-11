/**
 * Edge -> canvas communication for manual paths. RelationEdge components live
 * inside React Flow's renderer, so callbacks flow through context (stable
 * identity via refs in the provider) instead of per-edge data props.
 * features layer (FSD): local to erd-canvas.
 */
import { createContext, useContext } from 'react'
import type { EdgeSide, PathPoint } from '@/entities/layout'

export interface EdgePathContextValue {
  /** Commit a new manual path for the edge (drag end / panel edit). */
  commitWaypoints: (edgeId: string, waypoints: PathPoint[]) => void
  /** Remove the manual path — the edge returns to auto routing (Reset line). */
  resetPath: (edgeId: string) => void
  /**
   * Report the currently-RENDERED full polyline of a selected edge so the
   * canvas can expose it (SelectionInfo waypoints + panel edits on auto paths).
   */
  reportPath: (edgeId: string, full: PathPoint[]) => void
  /**
   * Re-anchor one endpoint to the other side of its table (좌/우 스왑).
   * Clears the edge's manual waypoints — the old geometry is meaningless after
   * the endpoint jumps sides; the path re-routes automatically.
   */
  setEdgeSide: (edgeId: string, end: 'source' | 'target', side: EdgeSide) => void
}

const noop = () => {}

// Noop default is intentional: isolated renders/tests run without a provider.
export const EdgePathContext = createContext<EdgePathContextValue>({
  commitWaypoints: noop,
  resetPath: noop,
  reportPath: noop,
  setEdgeSide: noop,
})

export function useEdgePathContext(): EdgePathContextValue {
  return useContext(EdgePathContext)
}
