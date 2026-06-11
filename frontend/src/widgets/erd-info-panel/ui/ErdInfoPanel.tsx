import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { DbmlSchema } from '@/entities/dbml'
import { deriveDisplayGroups } from '@/entities/erd'
import type { SelectionInfo } from '@/entities/erd'
import type { GroupOpHandlers } from '../model/types'
import { GroupSection } from './GroupSection'
import { SelectionSection } from './SelectionSection'

export interface ErdInfoPanelProps {
  schema: DbmlSchema | undefined
  /** Name of the currently selected table (for row highlight). */
  selected: string | null
  /** Called when a table row is clicked, with the schema-qualified table id. */
  onSelect: (tableId: string) => void
  /** DBML Project database_type value, when available. */
  dialect?: string
  /** Group mutation callbacks. When omitted, renders in read-only mode. */
  groupOps?: GroupOpHandlers
  /** While false, mutation triggers are disabled. Defaults to true. */
  mutationsEnabled?: boolean
  /** 캔버스가 보고한 현재 선택의 좌표 정보. 있으면 최상단에 Selection 섹션 표시. */
  selectionInfo?: SelectionInfo | null
  onEditNodePosition?: (nodeId: string, pos: { x: number; y: number }) => void
  onEditEdgeWaypoint?: (edgeId: string, vertexIndex: number, axis: 'x' | 'y', value: number) => void
  onResetEdgePath?: (edgeId: string) => void
}

/** Shared `panel-head` header row (44px, `--erd-border` bottom). */
function PanelHead({
  label,
  actions,
}: {
  label: string
  actions?: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 44,
        padding: '0 14px',
        flexShrink: 0,
        borderBottom: '1px solid var(--erd-border)',
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '.04em',
          textTransform: 'uppercase' as const,
          color: 'var(--erd-text-2)',
          flex: 1,
        }}
      >
        {label}
      </span>
      {actions}
    </div>
  )
}

/**
 * Right-column info panel: Schema summary stat grid + grouped, scrollable
 * Table names list.
 *
 * widgets layer: composes entities/erd (deriveDisplayGroups) + entities/dbml
 * types; no upward feature imports.
 */
export function ErdInfoPanel({
  schema,
  selected,
  onSelect,
  dialect,
  groupOps,
  mutationsEnabled = true,
  selectionInfo,
  onEditNodePosition,
  onEditEdgeWaypoint,
  onResetEdgePath,
}: ErdInfoPanelProps) {
  // Stat cells — safe to 0 when schema is undefined.
  const tables = schema?.tables.length ?? 0
  const refs = schema?.refs.length ?? 0
  const tableGroups = schema?.tableGroups.length ?? 0
  const enums = schema?.enums.length ?? 0
  const notes = schema?.notes.length ?? 0
  const dialectLabel = dialect ?? '—'

  const cells: [string, string | number][] = [
    ['Tables', tables],
    ['Refs', refs],
    ['Table groups', tableGroups],
    ['Enums', enums],
    ['Notes', notes],
    ['Dialect', dialectLabel],
  ]

  const displayGroups = schema ? deriveDisplayGroups(schema) : []

  // Collapse state: set of group keys that are collapsed
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Create group inline input state
  const [creating, setCreating] = useState(false)
  const [createValue, setCreateValue] = useState('')
  const [createError, setCreateError] = useState(false)

  // Named group names for Move-to targets
  const groupNames = displayGroups
    .filter((g) => g.key !== '__ungrouped')
    .map((g) => g.label)

  function toggleCollapse(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function commitCreate() {
    const trimmed = createValue.trim()
    if (!trimmed) return
    const isDuplicate = schema?.tableGroups.some((g) => g.name === trimmed)
    if (isDuplicate) {
      setCreateError(true)
      return
    }
    groupOps?.onCreateGroup(trimmed)
    setCreating(false)
    setCreateValue('')
    setCreateError(false)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        height: '100%',
      }}
    >
      {/* ── Selection (Q4 #3: 최상단, 선택 시에만) ─────────────── */}
      {selectionInfo && onEditNodePosition && onEditEdgeWaypoint && onResetEdgePath && (
        <>
          <PanelHead label="Selection" />
          <SelectionSection
            info={selectionInfo}
            onEditNodePosition={onEditNodePosition}
            onEditEdgeWaypoint={onEditEdgeWaypoint}
            onResetEdgePath={onResetEdgePath}
          />
        </>
      )}

      {/* ── Schema summary ─────────────────────────── */}
      <PanelHead label="Schema summary" />
      <div style={{ padding: 14, flexShrink: 0 }}>
        {/* 2-column grid: 1px gaps over --erd-border, outer radius 10 */}
        <div
          data-testid="schema-summary-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 1,
            background: 'var(--erd-border)',
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid var(--erd-border)',
          }}
        >
          {cells.map(([label, value]) => (
            <div
              key={label}
              style={{
                background: 'var(--erd-surface)',
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--erd-text-3)',
                  marginBottom: 4,
                }}
              >
                {label}
              </div>
              <div
                data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono, ui-monospace)',
                  letterSpacing: '-0.02em',
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Table names ───────────────────────────── */}
      <PanelHead
        label="Table names"
        actions={
          groupOps ? (
            <button
              data-testid="group-create-button"
              disabled={!mutationsEnabled}
              title={mutationsEnabled ? 'New group' : 'Fix DBML errors first'}
              onClick={() => {
                setCreating(true)
                setCreateValue('')
                setCreateError(false)
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 4,
                cursor: mutationsEnabled ? 'pointer' : 'not-allowed',
                color: 'var(--erd-text-3)',
                display: 'flex',
                alignItems: 'center',
                borderRadius: 4,
              }}
              aria-label="New group"
            >
              <Plus size={14} />
            </button>
          ) : undefined
        }
      />

      {/* Scrollable list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {/* Inline create input row */}
        {creating && (
          <div style={{ padding: '8px 14px' }}>
            <input
              data-testid="group-create-input"
              value={createValue}
              autoFocus
              placeholder="Group name…"
              onChange={(e) => {
                setCreateValue(e.target.value)
                setCreateError(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitCreate()
                } else if (e.key === 'Escape') {
                  setCreating(false)
                  setCreateValue('')
                  setCreateError(false)
                }
              }}
              style={{
                width: '100%',
                fontSize: 12,
                fontFamily: 'var(--font-mono, ui-monospace)',
                background: 'var(--erd-surface)',
                border: '1px solid var(--erd-border)',
                borderRadius: 4,
                padding: '4px 8px',
                color: 'inherit',
                boxSizing: 'border-box' as const,
              }}
            />
            {createError && (
              <div
                data-testid="group-create-error"
                style={{ fontSize: 11, color: 'var(--erd-error)', marginTop: 4 }}
              >
                A group with that name already exists.
              </div>
            )}
          </div>
        )}

        {displayGroups.length === 0 && !creating && (
          <div
            style={{ padding: '16px 14px', fontSize: 12, color: 'var(--erd-text-3)' }}
          >
            No tables
          </div>
        )}

        {displayGroups.map((group) => (
          <GroupSection
            key={group.key}
            group={group}
            groupNames={groupNames}
            selected={selected}
            onSelect={onSelect}
            collapsed={collapsed.has(group.key)}
            onToggleCollapse={() => toggleCollapse(group.key)}
            groupOps={groupOps}
            mutationsEnabled={mutationsEnabled}
          />
        ))}
      </div>
    </div>
  )
}
