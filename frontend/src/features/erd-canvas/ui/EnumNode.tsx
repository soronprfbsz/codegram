import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { EnumNodeData } from '@/entities/erd'

export type EnumNodeProps = NodeProps & { data: EnumNodeData }

/**
 * Custom React Flow node for a DBML enum: a labeled card listing the enum's
 * values. Carries a single non-connectable target Handle (left) so the
 * optional column-type -> enum link edge (when the adapter emits one) has an
 * anchor; otherwise the handle is inert. 3b is read-only.
 * features layer: depends on shared + entities/erd + @xyflow/react.
 */
function EnumNodeImpl({ data }: EnumNodeProps) {
  return (
    <div className="min-w-[140px] rounded border border-amber-300 bg-amber-50 text-xs shadow-sm">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!h-2 !w-2 !border !border-amber-400 !bg-white"
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
