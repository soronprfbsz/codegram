/**
 * Re-seeds a sticky note's display scale onto freshly schema-derived nodes
 * (ADR-0026). `schemaToFlow` builds nodes purely from DBML text, so a sticky
 * node it produces never carries `data.scale` — the scale only lives on the
 * LIVE React Flow node (and, once saved, in `project.layout`). Auto-arrange
 * reconciles fresh nodes against an EMPTY stored set (it discards all saved
 * positions), so without this step a note's enlarged size is lost the moment
 * auto-arrange runs, both on screen and in what gets persisted afterward.
 *
 * PURE, no side effects (FSD). entities layer: imports only entities/erd types.
 */
import type { ErdFlowNode, StickyNodeData } from '@/entities/erd'

export function seedNoteScales(
  flowNodes: ErdFlowNode[],
  liveNodes: ErdFlowNode[],
): ErdFlowNode[] {
  const liveById = new Map(liveNodes.map((n) => [n.id, n]))
  return flowNodes.map((node) => {
    if (node.type !== 'sticky') return node
    const live = liveById.get(node.id)
    if (!live || live.type !== 'sticky') return node
    const scale = (live.data as StickyNodeData).scale
    if (typeof scale !== 'number') return node
    return { ...node, data: { ...(node.data as StickyNodeData), scale } }
  })
}
