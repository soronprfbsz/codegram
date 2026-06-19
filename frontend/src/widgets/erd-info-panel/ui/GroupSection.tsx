import { useRef, useState } from 'react'
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react'
import type { TableSearchMatch } from '@/entities/dbml'
import type { DisplayGroup } from '@/entities/erd'
import type { GroupOpHandlers } from '../model/types'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/shared/ui/dropdown-menu'

export const GROUP_COLOR_PRESETS = [
  '#6938EF', '#1570EF', '#0E9384', '#DC6803', '#B42318',
  '#EA4A8B', '#099250', '#E04F16', '#7839EE', '#475467',
] as const

export interface GroupSectionProps {
  group: DisplayGroup
  /** 모든 명명 그룹 이름 (Move to 대상 목록). */
  groupNames: string[]
  selected: string | null
  onSelect: (tableId: string) => void
  collapsed: boolean
  onToggleCollapse: () => void
  groupOps?: GroupOpHandlers
  mutationsEnabled: boolean
  /** When searching: per-table match info, used to render a "why it matched" hint. */
  matches?: Map<string, TableSearchMatch>
  /** Table id under the keyboard cursor (↑/↓ in the search box), highlighted. */
  activeTableId?: string | null
}

export function GroupSection({
  group,
  groupNames,
  selected,
  onSelect,
  collapsed,
  onToggleCollapse,
  groupOps,
  mutationsEnabled,
  matches,
  activeTableId,
}: GroupSectionProps) {
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(group.label)
  // Synchronous flag for the menu's onCloseAutoFocus: React state may not have
  // flushed by the time radix restores focus to the trigger, so guard via ref.
  const renamingRef = useRef(false)

  const isUngrouped = group.key === '__ungrouped'

  function commitRename() {
    const trimmed = renameValue.trim()
    if (trimmed && groupOps) {
      groupOps.onRenameGroup(group.label, trimmed)
    }
    setRenaming(false)
  }

  return (
    <div>
      {/* Section header */}
      <div
        style={{
          padding: '14px 14px 5px',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '.08em',
          textTransform: 'uppercase' as const,
          color: 'var(--erd-text-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
        }}
      >
        {/* Collapse toggle */}
        <button
          data-testid={`group-toggle-${group.key}`}
          onClick={onToggleCollapse}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'var(--erd-text-3)',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
          aria-label={collapsed ? 'Expand group' : 'Collapse group'}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>

        {/* Group color dot (Ungrouped keeps a neutral icon instead) */}
        {isUngrouped ? (
          <span
            style={{
              color: group.color,
              fontFamily: 'var(--font-mono, ui-monospace)',
              fontSize: 10,
              opacity: 0.85,
            }}
            aria-hidden
          >
            ▦
          </span>
        ) : (
          <span
            data-testid={`group-dot-${group.key}`}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: group.color,
              flexShrink: 0,
            }}
          />
        )}

        {/* Label or rename input */}
        {renaming ? (
          <input
            data-testid="group-rename-input"
            value={renameValue}
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitRename()
              } else if (e.key === 'Escape') {
                setRenaming(false)
                setRenameValue(group.label)
              }
            }}
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '.08em',
              textTransform: 'uppercase' as const,
              color: 'var(--erd-text-3)',
              background: 'var(--erd-surface)',
              border: '1px solid var(--erd-border)',
              borderRadius: 4,
              padding: '1px 4px',
              flex: 1,
              minWidth: 0,
            }}
          />
        ) : (
          <span style={{ flex: 1 }}>{group.label}</span>
        )}

        {/* Group ⋯ menu — only for named groups when groupOps present */}
        {!isUngrouped && groupOps && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-testid={`group-menu-${group.key}`}
                disabled={!mutationsEnabled}
                onKeyDown={(e) => e.stopPropagation()}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 2,
                  cursor: mutationsEnabled ? 'pointer' : 'not-allowed',
                  color: 'var(--erd-text-3)',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  borderRadius: 4,
                }}
                aria-label="Group options"
              >
                <MoreHorizontal size={12} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              onCloseAutoFocus={(e) => {
                // Don't let radix return focus to the trigger while the rename
                // input is taking over (it would steal the input's autoFocus).
                if (renamingRef.current) {
                  e.preventDefault()
                  renamingRef.current = false
                }
              }}
            >
              <DropdownMenuLabel>Color</DropdownMenuLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 10px', maxWidth: 150 }}>
                {GROUP_COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    data-testid={`swatch-${c}`}
                    aria-label={`Set color ${c}`}
                    onClick={() => groupOps.onSetGroupColor(group.label, c)}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: c,
                      border: '1px solid var(--erd-border)',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
              <DropdownMenuItem onSelect={() => groupOps.onSetGroupColor(group.label, null)}>
                Default color
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  renamingRef.current = true
                  setRenameValue(group.label)
                  setRenaming(true)
                }}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => groupOps.onDeleteGroup(group.label)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Table rows */}
      {!collapsed && group.tables.map((table) => {
        const isSelected = selected === table.name
        const isActive = activeTableId === table.id
        const hint = matches?.get(table.id)?.hint ?? null
        // Move-to targets: all named groups except the current one, plus Ungrouped if not already ungrouped
        const currentGroup = isUngrouped ? null : group.label
        const moveTargets = groupNames.filter((n) => n !== currentGroup)

        return (
          <div
            key={table.id}
            role="button"
            tabIndex={0}
            data-testid={`tablelist-row-${table.name}`}
            onClick={() => onSelect(table.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(table.id)
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              // Left-indented to nest under the group header (chevron + dot offset).
              padding: '8px 14px 8px 33px',
              cursor: 'pointer',
              borderRadius: 8,
              transition: 'background 80ms ease',
              background: isSelected
                ? 'var(--erd-accent-soft)'
                : isActive
                  ? 'var(--erd-hover)'
                  : undefined,
              boxShadow: isActive ? 'inset 2px 0 0 var(--erd-accent)' : undefined,
              fontSize: 13,
            }}
            className={isSelected ? 'tlist-item-selected' : 'tlist-item'}
            onMouseEnter={(e) => {
              if (!isSelected) {
                ;(e.currentTarget as HTMLDivElement).style.background = 'var(--erd-hover)'
              }
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLDivElement).style.background = isSelected
                ? 'var(--erd-accent-soft)'
                : isActive
                  ? 'var(--erd-hover)'
                  : ''
            }}
          >
            {/* Table name (+ search match hint) */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono, ui-monospace)',
                  fontSize: 12.5,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {table.name}
              </span>
              {hint && (
                <span
                  data-testid={`tablelist-hint-${table.name}`}
                  style={{
                    fontSize: 10.5,
                    color: 'var(--erd-text-3)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' as const,
                  }}
                >
                  {hint}
                </span>
              )}
            </div>

            {/* Field count */}
            <span
              style={{
                fontSize: 11,
                color: 'var(--erd-text-3)',
                fontFamily: 'var(--font-mono, ui-monospace)',
              }}
            >
              {table.columns.length}
            </span>

            {/* Move ⋯ menu */}
            {groupOps && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    data-testid={`table-move-${table.name}`}
                    disabled={!mutationsEnabled}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 2,
                      cursor: mutationsEnabled ? 'pointer' : 'not-allowed',
                      color: 'var(--erd-text-3)',
                      display: 'flex',
                      alignItems: 'center',
                      flexShrink: 0,
                      borderRadius: 4,
                    }}
                    aria-label="Move table"
                  >
                    <MoreHorizontal size={12} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Move to</DropdownMenuLabel>
                  {moveTargets.map((n) => (
                    <DropdownMenuItem key={n} onSelect={() => groupOps.onMoveTable(table.id, n)}>
                      {n}
                    </DropdownMenuItem>
                  ))}
                  {currentGroup !== null && (
                    <DropdownMenuItem onSelect={() => groupOps.onMoveTable(table.id, null)}>
                      Ungrouped
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )
      })}
    </div>
  )
}
