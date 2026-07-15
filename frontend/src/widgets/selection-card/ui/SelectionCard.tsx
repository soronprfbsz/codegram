import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCw, X, GripVertical } from 'lucide-react'
import type { SelectionInfo } from '@/entities/erd'
import { useSelectionCardStore } from '@/shared/store/selectionCard'

export interface SelectionCardProps {
  info: SelectionInfo
  /** 절대좌표 커밋 — 캔버스가 그룹 멤버의 상대 변환을 처리한다. */
  onEditNodePosition: (nodeId: string, pos: { x: number; y: number }) => void
  /** 꺾임점 단일 축 편집 — 자동 경로면 이 커밋으로 수동 전환된다. */
  onEditEdgeWaypoint: (edgeId: string, vertexIndex: number, axis: 'x' | 'y', value: number) => void
  onResetEdgePath: (edgeId: string) => void
  /** X 버튼 — 카드를 닫는다(다음 선택 전까지 숨김). */
  onClose: () => void
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
}
const labelStyle: React.CSSProperties = {
  fontSize: 'var(--erd-fs-xs)',
  color: 'var(--erd-text-3)',
  width: 14,
  flexShrink: 0,
}
const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  fontSize: 'var(--erd-fs-sm)',
  fontFamily: 'var(--font-mono, ui-monospace)',
  background: 'var(--erd-surface-2)',
  border: '1px solid var(--erd-border)',
  borderRadius: 4,
  padding: '4px 8px',
  color: 'inherit',
  boxSizing: 'border-box',
}

/** 정수 좌표 입력 — Enter/blur 커밋, 비숫자는 원복. info 갱신 시 재동기화. */
function CoordInput({
  value,
  onCommit,
  testid,
}: {
  value: number
  onCommit: (v: number) => void
  testid: string
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => {
    setDraft(String(value))
  }, [value])
  function commit() {
    const n = draft.trim() === '' ? NaN : Math.round(Number(draft))
    if (Number.isFinite(n) && n !== value) onCommit(n)
    else setDraft(String(value))
  }
  return (
    <input
      data-testid={testid}
      value={draft}
      inputMode="numeric"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
      }}
      onBlur={commit}
      style={inputStyle}
    />
  )
}

/**
 * 캔버스 위에 떠 있는 "Selection" 카드 — DBML 에디터 바로 우측(캔버스 좌상단)에
 * 절대 위치로 띄운다. 선택된 노드의 절대좌표 x/y, 선택된 엣지의 꺾임점을
 * 표시·편집하고, X로 닫는다. 끝점은 컬럼 앵커라 표시하지 않는다.
 *
 * widgets layer: entities/erd 타입만 의존(FSD). 캔버스 래퍼(position:relative)
 * 안에 렌더되어 좌상단에 떠야 하므로 위치/z-index를 자체적으로 가진다.
 */
export function SelectionCard({
  info,
  onEditNodePosition,
  onEditEdgeWaypoint,
  onResetEdgePath,
  onClose,
}: SelectionCardProps) {
  const { t } = useTranslation()

  // 위치는 테마·언어와 같은 저장소(localStorage 기반)에 저장한다(DB 불필요).
  // null이면 기본 좌상단. 드래그로 옮긴 위치는 다음 선택에서도 유지된다.
  const storedPos = useSelectionCardStore((s) => s.pos)
  const setPos = useSelectionCardStore((s) => s.setPos)
  const pos = storedPos ?? { x: 12, y: 12 }

  const rootRef = useRef<HTMLDivElement>(null)
  // 헤더 드래그: pointer 캡처로 카드를 옮기고, 떼면 위치를 저장한다.
  const dragRef = useRef<{ ox: number; oy: number; bx: number; by: number } | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)

  // 이동 영역 제한: 카드가 캔버스 밖으로 나가 헤더(드래그 핸들)가 사라지면
  // 다시는 못 옮기는 소프트락이 생긴다. offsetParent(캔버스 래퍼) 안으로
  // 위치를 가둬 항상 헤더가 보이고 잡을 수 있게 한다. 컨테이너를 못 재면 원값.
  function clamp(p: { x: number; y: number }): { x: number; y: number } {
    const parent = rootRef.current?.offsetParent as HTMLElement | null
    const card = rootRef.current
    if (!parent || !card) return p
    const cw = card.offsetWidth || 248
    const ch = card.offsetHeight || 44
    const maxX = Math.max(0, parent.clientWidth - cw)
    const maxY = Math.max(0, parent.clientHeight - ch)
    return {
      x: Math.min(Math.max(p.x, 0), maxX),
      y: Math.min(Math.max(p.y, 0), maxY),
    }
  }

  // 저장된 위치가 이미 화면 밖이면(레이아웃/리사이즈 변화) 한 번 보정해 가둔다.
  useEffect(() => {
    if (!storedPos) return
    const c = clamp(storedPos)
    if (c.x !== storedPos.x || c.y !== storedPos.y) setPos(c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedPos])

  const livePos = dragPos ?? pos

  function onHandlePointerDown(e: React.PointerEvent) {
    // 좌클릭만, 헤더의 버튼(닫기/리셋) 위에서는 시작하지 않는다.
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { ox: e.clientX, oy: e.clientY, bx: pos.x, by: pos.y }
    setDragPos(pos)
  }
  function onHandlePointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    setDragPos(clamp({ x: d.bx + (e.clientX - d.ox), y: d.by + (e.clientY - d.oy) }))
  }
  function onHandlePointerUp(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    const next = clamp({ x: d.bx + (e.clientX - d.ox), y: d.by + (e.clientY - d.oy) })
    dragRef.current = null
    setDragPos(null)
    setPos(next)
  }

  return (
    <div
      ref={rootRef}
      data-testid="selection-section"
      style={{
        position: 'absolute',
        top: livePos.y,
        left: livePos.x,
        zIndex: 5,
        width: 248,
        background: 'var(--erd-surface)',
        border: '1px solid var(--erd-border)',
        borderRadius: 10,
        boxShadow: 'var(--erd-shadow)',
        overflow: 'hidden',
      }}
    >
      {/* 헤더 — 드래그 핸들(이동) + 라벨 + 타입 배지 + (수동 엣지) 리셋 + 닫기.
          hover 시 이동 커서 + grip 아이콘 노출. */}
      <div
        data-testid="selection-card-handle"
        className="erd-selcard-handle"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 8px 8px 12px',
          borderBottom: '1px solid var(--erd-border)',
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        <GripVertical
          className="erd-selcard-grip"
          size={13}
          strokeWidth={2}
          style={{ color: 'var(--erd-text-3)', flexShrink: 0 }}
          aria-hidden
        />
        <span
          style={{
            fontSize: 'var(--erd-fs-sm)',
            fontWeight: 600,
            fontFamily: 'var(--font-mono, ui-monospace)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {info.label}
        </span>
        <span
          style={{
            fontSize: 'var(--erd-fs-2xs)',
            padding: '1px 6px',
            borderRadius: 9999,
            background: 'var(--erd-hover)',
            color: 'var(--erd-text-2)',
            flexShrink: 0,
          }}
        >
          {info.kind === 'node'
            ? info.nodeType
            : info.manual
              ? t('selectionCard.manual')
              : t('selectionCard.auto')}
        </span>
        {info.kind === 'edge' && info.manual && (
          <button
            data-testid="edge-reset-panel"
            title={t('selectionCard.resetLine')}
            onClick={() => onResetEdgePath(info.edgeId)}
            style={{
              background: 'none',
              border: 'none',
              padding: 2,
              cursor: 'pointer',
              color: 'var(--erd-text-3)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RotateCw size={13} strokeWidth={2} />
          </button>
        )}
        <button
          data-testid="selection-card-close"
          aria-label={t('selectionCard.close')}
          title={t('common.close')}
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            padding: 2,
            cursor: 'pointer',
            color: 'var(--erd-text-3)',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      {/* 본문 — 좌표 편집 */}
      <div data-testid="selection-card-body" style={{ padding: '8px 12px' }}>
        {info.kind === 'node' ? (
          <div style={rowStyle}>
            <span style={labelStyle}>X</span>
            <CoordInput
              value={info.x}
              testid="sel-x"
              onCommit={(v) => onEditNodePosition(info.nodeId, { x: v, y: info.y })}
            />
            <span style={labelStyle}>Y</span>
            <CoordInput
              value={info.y}
              testid="sel-y"
              onCommit={(v) => onEditNodePosition(info.nodeId, { x: info.x, y: v })}
            />
          </div>
        ) : info.waypoints.length === 0 ? (
          <div style={{ fontSize: 'var(--erd-fs-xs)', color: 'var(--erd-text-3)' }}>
            {t('selectionCard.noBends')}
          </div>
        ) : (
          info.waypoints.map((p, i) => (
            // key={i}: 꺾임점 병합으로 리스트가 줄면 살아남은 행이 새 vertex 값으로
            // 리싱크된다 — 좌표 기반 key는 중복 좌표에서 깨져 의도적으로 회피.
            <div key={i} style={rowStyle}>
              <span style={{ ...labelStyle, width: 18 }}>#{i + 1}</span>
              <CoordInput
                value={p.x}
                testid={`wp-${i}-x`}
                onCommit={(v) => onEditEdgeWaypoint(info.edgeId, i, 'x', v)}
              />
              <CoordInput
                value={p.y}
                testid={`wp-${i}-y`}
                onCommit={(v) => onEditEdgeWaypoint(info.edgeId, i, 'y', v)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
