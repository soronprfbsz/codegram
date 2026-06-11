export { reconcileLayout, nodesToLayout } from './lib/reconcile'
export { fitGroupBoxes } from './lib/groupBox'
export { computeSyncedPositions } from './lib/placeNewTables'
export type {
  StoredPosition,
  LayoutPositions,
  StoredLayout,
  StoredEdgePath,
  EdgePaths,
} from './model/types'

export {
  buildManualPath,
  dragSegment,
  editVertexAxis,
  simplifyPath,
  pruneEdgePaths,
  type PathPoint,
} from './lib/edgePath'
