import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { StickyNodeData } from '@/entities/erd'

export type StickyNoteProps = NodeProps & { data: StickyNodeData }

/**
 * Custom React Flow node for a standalone DBML Note: a read-only sticky card
 * showing the note title and content. No handles (notes have no
 * relationships). Position is auto-laid-out and NOT persisted in 3b.
 * features layer: depends on shared + entities/erd + @xyflow/react.
 */
function StickyNoteImpl({ data }: StickyNoteProps) {
  return (
    <div
      className="min-w-[160px] max-w-[260px] rounded border border-yellow-300 bg-yellow-100 text-xs shadow-sm"
      style={
        data.headerColor ? { borderTopColor: data.headerColor } : undefined
      }
    >
      <div className="border-b border-yellow-200 px-3 py-1.5 text-sm font-semibold text-yellow-900">
        {data.title}
      </div>
      <p className="whitespace-pre-wrap px-3 py-1.5 text-yellow-800">
        {data.content}
      </p>
    </div>
  )
}

export const StickyNote = memo(StickyNoteImpl)
