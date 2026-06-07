import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { GroupNodeData } from '@/entities/erd'

export type GroupNodeProps = NodeProps & { data: GroupNodeData }

/**
 * Convert a #rrggbb (or #rgb) hex to an rgba() string at the given alpha.
 * Falls back to a neutral slate tint for missing/invalid input so a group
 * region is always visible.
 */
function tint(color: string | undefined, alpha: number): string {
  const fallback = '100, 116, 139' // slate-500
  if (!color) return `rgba(${fallback}, ${alpha})`
  let hex = color.trim().replace(/^#/, '')
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (hex.length !== 6 || /[^0-9a-fA-F]/.test(hex)) {
    return `rgba(${fallback}, ${alpha})`
  }
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Custom React Flow node for a DBML table group: a colored background REGION
 * drawn behind its member tables (D6). The node is sized by the layout step
 * (style.width/height set to the members' bounding box) and rendered first in
 * the nodes array so member tables (parentId = this node) stack above it. The
 * region is pointer-events:none so interaction passes through to the tables.
 * features layer: depends on shared + entities/erd + @xyflow/react.
 */
function GroupNodeImpl({ id, data }: GroupNodeProps) {
  return (
    <div
      data-testid={`group-region-${id}`}
      className="h-full w-full rounded-lg"
      style={{
        pointerEvents: 'none',
        width: '100%',
        height: '100%',
        backgroundColor: tint(data.color, 0.1),
        border: `2px dashed ${tint(data.color, 0.6)}`,
      }}
    >
      <span
        className="absolute left-2 top-1 text-xs font-semibold"
        style={{ color: tint(data.color, 0.9), pointerEvents: 'none' }}
      >
        {data.groupName}
      </span>
    </div>
  )
}

export const GroupNode = memo(GroupNodeImpl)
