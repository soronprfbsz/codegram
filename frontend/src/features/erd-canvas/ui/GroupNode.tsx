import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { LayoutGrid } from 'lucide-react'
import type { GroupNodeData } from '@/entities/erd'
import { useGroupActionContext } from '../lib/groupActionContext'

export type GroupNodeProps = NodeProps & { data: GroupNodeData }

/**
 * 그룹 배경. 내부 필은 pointer-events:none → 클릭이 아래 엣지/핸들/버튼으로 통과.
 * 라벨 크롬(.erd-group-handle)만 interactive: React Flow dragHandle(라벨로만
 * 그룹 드래그 = 멤버 일괄 이동) + hover 시 정렬 버튼(group-arrange-*) 노출.
 * 버튼은 onArrangeGroup(id)로 그룹 제자리 정렬을 트리거하고 드래그 시작은 막는다.
 * features layer: shared + entities/erd + @xyflow/react.
 */
function GroupNodeImpl({ id, data }: GroupNodeProps) {
  const color = data.color ?? 'var(--erd-border-2)'
  const borderColor = `color-mix(in srgb, ${color} 50%, transparent)`
  const bgColor = `color-mix(in srgb, ${color} 7%, transparent)`
  const { onArrangeGroup } = useGroupActionContext()

  return (
    <div
      data-testid={`group-region-${id}`}
      className="erd-group-region"
      style={{
        pointerEvents: 'none', // 필은 통과 (요청 1)
        width: '100%',
        height: '100%',
        borderRadius: 16,
        border: `1px dashed ${borderColor}`,
        backgroundColor: bgColor,
        position: 'relative',
      }}
    >
      {/* 라벨 크롬 = 유일한 interactive 영역 (드래그 핸들 + hover 버튼) */}
      <div
        className="erd-group-handle"
        style={{
          pointerEvents: 'auto',
          position: 'absolute',
          top: 4,
          left: 8,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '2px 4px',
          cursor: 'grab',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            color,
            textTransform: 'uppercase',
            fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, opacity: 0.85, flexShrink: 0 }} />
          {data.groupName}
        </span>
        {/* 정렬 버튼 — 평소 숨김, .erd-group-handle hover 시 노출(css) */}
        <button
          data-testid={`group-arrange-${id}`}
          className="erd-group-arrange"
          title="이 그룹 정렬"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onArrangeGroup(id)
          }}
          style={{
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            borderRadius: 6,
            border: `1px solid ${borderColor}`,
            background: 'var(--erd-surface)',
            color,
            cursor: 'pointer',
          }}
        >
          <LayoutGrid size={12} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

export const GroupNode = memo(GroupNodeImpl)
