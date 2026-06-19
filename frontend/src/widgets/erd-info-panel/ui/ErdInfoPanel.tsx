import { useEffect, useRef, useState } from 'react'
import { Plus, Search, PanelRightClose } from 'lucide-react'
import type { DbmlSchema } from '@/entities/dbml'
import { searchTables } from '@/entities/dbml'
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
  /**
   * Called when a table is chosen via search (row click or Enter) — navigates
   * the canvas to that table and highlights the matched column(s). Falls back to
   * onSelect when omitted.
   */
  onNavigateToTable?: (tableId: string, matchedColumnIds: string[]) => void
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
  /** Collapse the panel to the rail. When omitted, the header toggle is hidden. */
  onCollapse?: () => void
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
  onNavigateToTable,
  dialect,
  groupOps,
  mutationsEnabled = true,
  selectionInfo,
  onEditNodePosition,
  onEditEdgeWaypoint,
  onResetEdgePath,
  onCollapse,
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

  // ── Table search (name/column/note, case-insensitive substring) ──────────
  const [query, setQuery] = useState('')
  const searchActive = query.trim().length > 0
  const matches = searchActive ? searchTables(schema, query) : new Map()
  // While searching: keep only matching tables, drop empty groups, force-expand.
  const visibleGroups = searchActive
    ? displayGroups
        .map((g) => ({ ...g, tables: g.tables.filter((t) => matches.has(t.id)) }))
        .filter((g) => g.tables.length > 0)
    : displayGroups
  const flatMatched = searchActive ? visibleGroups.flatMap((g) => g.tables) : []

  // Keyboard cursor over the flat match list (↑/↓ move, Enter navigates).
  const [activeIndex, setActiveIndex] = useState(0)
  useEffect(() => setActiveIndex(0), [query])
  const activeTableId = searchActive ? flatMatched[activeIndex]?.id ?? null : null

  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // "/" focuses the search box — unless focus is already in a text field/editor.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        el?.isContentEditable ||
        el?.closest('.cm-editor')
      ) {
        return
      }
      e.preventDefault()
      searchInputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Keep the keyboard-active row scrolled into view.
  useEffect(() => {
    if (!searchActive) return
    const t = flatMatched[activeIndex]
    if (!t) return
    listRef.current
      ?.querySelector(`[data-testid="tablelist-row-${CSS.escape(t.name)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, searchActive, flatMatched])

  function commitNavigate(tableId: string) {
    if (onNavigateToTable) {
      onNavigateToTable(tableId, matches.get(tableId)?.matchedColumnIds ?? [])
    } else {
      onSelect(tableId)
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(flatMatched.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const t = flatMatched[activeIndex] ?? flatMatched[0]
      if (t) commitNavigate(t.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (query) setQuery('')
      else searchInputRef.current?.blur()
    }
  }

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
      {/* ── Panel header (44px) — label + collapse to rail ───────── */}
      {onCollapse && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 44,
            padding: '0 8px 0 14px',
            flexShrink: 0,
            borderBottom: '1px solid var(--erd-border)',
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '.04em',
              textTransform: 'uppercase',
              color: 'var(--erd-text-2)',
              flex: 1,
            }}
          >
            정보
          </span>
          <button
            type="button"
            className="erd-topbar-btn"
            onClick={onCollapse}
            aria-label="Collapse info panel"
            title="정보 패널 접기"
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 28,
              height: 28,
              flexShrink: 0,
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--erd-text-3)',
              cursor: 'pointer',
            }}
          >
            <PanelRightClose size={16} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* ── Table search (상시, 최상단) ─────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          flexShrink: 0,
          borderBottom: '1px solid var(--erd-border)',
        }}
      >
        <Search size={14} style={{ color: 'var(--erd-text-3)', flexShrink: 0 }} aria-hidden />
        <input
          ref={searchInputRef}
          data-testid="table-search-input"
          value={query}
          placeholder="테이블 · 컬럼 · 주석 검색  (/)"
          aria-label="Search tables"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12.5,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'inherit',
          }}
        />
        {searchActive && (
          <button
            data-testid="table-search-clear"
            aria-label="Clear search"
            onClick={() => {
              setQuery('')
              searchInputRef.current?.focus()
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: 2,
              cursor: 'pointer',
              color: 'var(--erd-text-3)',
              fontSize: 13,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>

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
      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
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

        {visibleGroups.length === 0 && !creating && (
          <div
            style={{ padding: '16px 14px', fontSize: 12, color: 'var(--erd-text-3)' }}
          >
            {searchActive ? '검색 결과 없음' : 'No tables'}
          </div>
        )}

        {visibleGroups.map((group) => (
          <GroupSection
            key={group.key}
            group={group}
            groupNames={groupNames}
            selected={selected}
            onSelect={searchActive ? commitNavigate : onSelect}
            collapsed={searchActive ? false : collapsed.has(group.key)}
            onToggleCollapse={() => toggleCollapse(group.key)}
            groupOps={groupOps}
            mutationsEnabled={mutationsEnabled}
            matches={searchActive ? matches : undefined}
            activeTableId={activeTableId}
          />
        ))}
      </div>
    </div>
  )
}
