import { memo, type CSSProperties } from 'react'
import type { NodeProps } from '@xyflow/react'
import { clampNoteScale, type StickyNodeData } from '@/entities/erd'

export type StickyNoteProps = NodeProps & { data: StickyNodeData }

/** 배율에 비례하는 안쪽 여백 — 패딩도 카드와 같은 비율로 커진다. */
const PAD = 'calc(var(--erd-note-pad-y) * var(--note-scale)) calc(var(--erd-note-pad-x) * var(--note-scale))'

/**
 * Custom React Flow node for a standalone DBML Note: a read-only sticky card
 * showing the note title and content. No handles (notes have no relationships).
 *
 * 크기는 명시 치수가 아니라 배율 하나로 표현한다(ADR-0026): 루트에 --note-scale을
 * 걸고 모든 기하를 calc(토큰 × 배율)로 파생시키므로 실제 border-box가 배율만큼
 * 커진다 → React Flow의 measured가 정확해지고 엣지 장애물·선택 링이 따라온다.
 * (CSS transform: scale()은 border-box를 바꾸지 않아 measured가 어긋난다.)
 * features layer: depends on shared + entities/erd + @xyflow/react.
 */
function StickyNoteImpl({ id, data }: StickyNoteProps) {
  const scale = clampNoteScale(data.scale)

  return (
    <div
      data-testid={`sticky-note-${id}`}
      className="shadow-sm"
      style={
        {
          '--note-scale': String(scale),
          position: 'relative',
          minWidth: 'calc(var(--erd-note-min-w) * var(--note-scale))',
          maxWidth: 'calc(var(--erd-note-max-w) * var(--note-scale))',
          borderRadius: 'calc(var(--erd-note-radius) * var(--note-scale))',
          border: 'calc(var(--erd-note-border-w) * var(--note-scale)) solid var(--erd-note-border)',
          ...(data.headerColor ? { borderTopColor: data.headerColor } : {}),
          background: 'var(--erd-note-bg)',
          fontSize: 'calc(var(--erd-fs-sm) * var(--note-scale))',
        } as CSSProperties
      }
    >
      <div
        style={{
          borderBottom:
            'calc(var(--erd-note-border-w) * var(--note-scale)) solid var(--erd-note-head-border)',
          padding: PAD,
          fontSize: 'calc(var(--erd-fs-md) * var(--note-scale))',
          fontWeight: 600,
          color: 'var(--erd-note-head-text)',
        }}
      >
        {data.title}
      </div>
      <p
        className="whitespace-pre-wrap"
        style={{ padding: PAD, color: 'var(--erd-note-text)' }}
      >
        {data.content}
      </p>
    </div>
  )
}

export const StickyNote = memo(StickyNoteImpl)
