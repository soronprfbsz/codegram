import { memo, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { NodeProps } from '@xyflow/react'
import { clampNoteScale, NOTE_SCALE_MIN, type StickyNodeData } from '@/entities/erd'
import { useCanvasReadOnly } from '../lib/canvasReadOnly'
import { useNoteScaleContext } from '../lib/noteScaleContext'

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
  const { t } = useTranslation()
  const scale = clampNoteScale(data.scale)
  const readOnly = useCanvasReadOnly()
  const { onNoteScale } = useNoteScaleContext()
  const cardRef = useRef<HTMLDivElement>(null)
  /** 드래그 시작 시점의 배율·포인터 X·카드 폭(화면 px). */
  const dragRef = useRef<{ s0: number; x0: number; w0: number } | null>(null)

  /** 화면 px 비율로 배율을 낸다 — dx와 폭이 같은 좌표계라 RF 줌이 약분된다. */
  const scaleAt = (clientX: number): number => {
    const d = dragRef.current!
    return clampNoteScale(d.s0 * (1 + (clientX - d.x0) / d.w0))
  }

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    // RF의 노드 드래그(카드 이동)와 분리한다 — 핸들은 이동이 아니라 확대다.
    e.stopPropagation()
    const w = cardRef.current?.getBoundingClientRect().width ?? 0
    if (w <= 0) return
    dragRef.current = { s0: scale, x0: e.clientX, w0: w }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const moveResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    onNoteScale(id, scaleAt(e.clientX), false)
  }

  const endResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    const next = scaleAt(e.clientX)
    dragRef.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    // 움직이지 않은 클릭으로는 저장하지 않는다(불필요한 autosave 방지).
    if (next !== d.s0) onNoteScale(id, next, true)
  }

  return (
    <div
      ref={cardRef}
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
          lineHeight: 'var(--erd-note-lh-body)',
        } as CSSProperties
      }
    >
      <div
        style={{
          borderBottom:
            'calc(var(--erd-note-border-w) * var(--note-scale)) solid var(--erd-note-head-border)',
          padding: PAD,
          fontSize: 'calc(var(--erd-fs-md) * var(--note-scale))',
          lineHeight: 'var(--erd-note-lh-head)',
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
      {!readOnly && (
        <div
          data-testid={`note-resize-${id}`}
          title={t('note.resize')}
          aria-label={t('note.resize')}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onDoubleClick={(e) => {
            // 카드 더블클릭 = centerOnNode(ErdCanvas onNodeDoubleClick)이므로 반드시 막는다.
            e.stopPropagation()
            onNoteScale(id, NOTE_SCALE_MIN, true)
          }}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 'var(--erd-note-handle)',
            height: 'var(--erd-note-handle)',
            cursor: 'nwse-resize',
            // 우하단 코너를 채우는 삼각형 — 테두리 색을 그대로 쓴다(F2).
            background:
              'linear-gradient(135deg, transparent 50%, var(--erd-note-border) 50%)',
            touchAction: 'none',
          }}
        />
      )}
    </div>
  )
}

export const StickyNote = memo(StickyNoteImpl)
