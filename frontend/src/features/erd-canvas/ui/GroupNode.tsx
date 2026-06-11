import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { GroupNodeData } from '@/entities/erd'

export type GroupNodeProps = NodeProps & { data: GroupNodeData }

/**
 * Custom React Flow node for a DBML table group — Backstage spec restyle
 * (Phase 4). Dashed 1px border in color-mix(group 50%, transparent), fill
 * color-mix(group 7%, transparent), radius 16. Group tag top-left: color dot +
 * uppercase label, 11px/600, group color. Non-interactive backdrop.
 * features layer: depends on shared + entities/erd + @xyflow/react.
 */
function GroupNodeImpl({ id, data }: GroupNodeProps) {
  const color = data.color ?? 'var(--erd-border-2)'

  // color-mix() for border and background tints.
  const borderColor = `color-mix(in srgb, ${color} 50%, transparent)`
  const bgColor = `color-mix(in srgb, ${color} 7%, transparent)`

  return (
    <div
      data-testid={`group-region-${id}`}
      style={{
        pointerEvents: 'none',
        width: '100%',
        height: '100%',
        borderRadius: 16,
        border: `1px dashed ${borderColor}`,
        backgroundColor: bgColor,
        position: 'relative',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 8,
          left: 12,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color,
          textTransform: 'uppercase',
          pointerEvents: 'none',
          fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            opacity: 0.85,
            flexShrink: 0,
          }}
        />
        {data.groupName}
      </span>
    </div>
  )
}

export const GroupNode = memo(GroupNodeImpl)
