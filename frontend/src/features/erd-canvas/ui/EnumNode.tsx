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
  const { isSelected } = data
  return (
    <div
      className="min-w-[140px] rounded border border-amber-300 bg-amber-50 text-xs shadow-sm"
      // 선택 링: 테이블 노드(TableNode)와 동일한 토큰(--primary)·동일 모양을 쓴다.
      // 미선택 시 기본 amber 보더/그림자 클래스를 그대로 두고, 선택 시에만 인라인으로
      // 덮어 일관된 선택 표시를 준다.
      style={
        isSelected
          ? {
              borderColor: 'var(--primary)',
              boxShadow:
                '0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent), var(--erd-shadow)',
            }
          : undefined
      }
    >
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
