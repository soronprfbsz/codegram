import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { EnumNodeData } from '@/entities/erd'

export type EnumNodeProps = NodeProps & { data: EnumNodeData }

/**
 * Custom React Flow node for a DBML enum: a labeled card listing the enum's
 * values. Carries non-connectable target Handles on BOTH sides — the default
 * `in` (left) and the alternate `in@right` — so the column→enum link can flip
 * its enum-side anchor (drag the endpoint to the other side), mirroring the
 * table column `@left`/`@right` convention. The handles are inert otherwise.
 * features layer: depends on shared + entities/erd + @xyflow/react.
 */
function EnumNodeImpl({ data }: EnumNodeProps) {
  return (
    <div className="min-w-[140px] rounded border border-amber-300 bg-amber-50 text-xs shadow-sm">
      <Handle
        type="target"
        id="in"
        position={Position.Left}
        isConnectable={false}
        style={{ left: 0, top: '50%', width: 6, height: 6, opacity: 0, pointerEvents: 'none' }}
      />
      <Handle
        type="target"
        id="in@right"
        position={Position.Right}
        isConnectable={false}
        style={{ right: 0, top: '50%', width: 6, height: 6, opacity: 0, pointerEvents: 'none' }}
      />
      <div className="rounded-t bg-amber-200 px-3 py-1.5 text-sm font-semibold text-amber-900">
        {data.enumName}
      </div>
      <ul className="flex flex-col gap-0.5 px-3 py-1.5 text-amber-800">
        {data.values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  )
}

export const EnumNode = memo(EnumNodeImpl)
