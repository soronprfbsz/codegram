import { useEffect, useState } from 'react'
import { RotateCw } from 'lucide-react'
import type { SelectionInfo } from '@/entities/erd'

export interface SelectionSectionProps {
  info: SelectionInfo
  /** 절대좌표 커밋 — 캔버스가 그룹 멤버의 상대 변환을 처리한다. */
  onEditNodePosition: (nodeId: string, pos: { x: number; y: number }) => void
  /** 꺾임점 단일 축 편집 — 자동 경로면 이 커밋으로 수동 전환된다. */
  onEditEdgeWaypoint: (edgeId: string, vertexIndex: number, axis: 'x' | 'y', value: number) => void
  onResetEdgePath: (edgeId: string) => void
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
}
const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--erd-text-3)',
  width: 14,
  flexShrink: 0,
}
const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  fontSize: 12,
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
 * Info 패널 최상단 "Selection" 섹션 (Q4 #3): 선택된 노드의 절대좌표 x/y,
 * 선택된 엣지의 꺾임점 목록을 표시·편집한다. 끝점은 컬럼 앵커라 표시하지
 * 않는다. widgets layer: entities 타입만 의존 (FSD).
 */
export function SelectionSection({
  info,
  onEditNodePosition,
  onEditEdgeWaypoint,
  onResetEdgePath,
}: SelectionSectionProps) {
  return (
    <div
      data-testid="selection-section"
      style={{ padding: '10px 14px', borderBottom: '1px solid var(--erd-border)', flexShrink: 0 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span
          style={{
            fontSize: 12,
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
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 9999,
            background: 'var(--erd-hover)',
            color: 'var(--erd-text-2)',
            flexShrink: 0,
          }}
        >
          {info.kind === 'node' ? info.nodeType : info.manual ? 'Manual' : 'Auto'}
        </span>
        {info.kind === 'edge' && info.manual && (
          <button
            data-testid="edge-reset-panel"
            title="Reset line"
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
      </div>

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
        <div style={{ fontSize: 11, color: 'var(--erd-text-3)' }}>No bends</div>
      ) : (
        info.waypoints.map((p, i) => (
          // key={i}: 꺾임점 병합으로 리스트가 줄면 살아남은 행이 새 vertex 값으로 리싱크된다
          // (커밋 시점에만 병합이 일어나므로 입력 중 충돌은 없다) — 좌표 기반 key는 중복 좌표에서 깨져 의도적으로 회피.
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
  )
}
