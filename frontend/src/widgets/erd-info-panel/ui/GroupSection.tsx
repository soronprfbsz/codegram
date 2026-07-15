import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
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

// Mid-tone, saturated hues (≈Tailwind 500) chosen to stay clearly visible on
// BOTH the light canvas (#f4f4f4 / #fff) and the dark canvas (#12151b) — the
// previous darker presets (e.g. #B42318, #475467) sank into the dark theme.
export const GROUP_COLOR_PRESETS = [
  '#EF4444', '#F97316', '#F59E0B', '#22C55E', '#14B8A6',
  '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899', '#64748B',
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
  const { t } = useTranslation()
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(group.label)
  // 그룹 삭제도 공통 확인 모달로 재확인(파괴적 작업).
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Synchronous flag for the menu's onCloseAutoFocus: React state may not have
  // flushed by the time radix restores focus to the trigger, so guard via ref.
  const renamingRef = useRef(false)

  // 선택된 행을 패널 스크롤 영역 안으로 끌어온다(캔버스에서 선택 시 그룹이
  // 펼쳐진 뒤 해당 행이 화면에 보이도록). 이 그룹에 선택 행이 있을 때만 ref가
  // 채워지므로, selected/collapsed 변화 시 그 행으로만 스크롤한다.
  const selectedRowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [selected, collapsed])

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
          aria-label={collapsed ? t('groupSection.expand') : t('groupSection.collapse')}
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
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 'normal',
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
          <span style={{ flex: 1, fontSize: 13, letterSpacing: 'normal' }}>{group.label}</span>
        )}

        {/* Table count for this group */}
        <span
          data-testid={`group-count-${group.key}`}
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--erd-text-3)',
            fontFamily: 'var(--font-mono, ui-monospace)',
            flexShrink: 0,
            letterSpacing: 0,
          }}
        >
          {group.tables.length}
        </span>

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
                aria-label={t('groupSection.options')}
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
              <DropdownMenuLabel>{t('groupSection.color')}</DropdownMenuLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 10px', maxWidth: 150 }}>
                {GROUP_COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    data-testid={`swatch-${c}`}
                    aria-label={t('groupSection.setColor', { color: c })}
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
                {/* Custom color picker — a rainbow swatch hosting a native color input. */}
                <label
                  data-testid="swatch-custom"
                  title={t('groupSection.customColor')}
                  style={{
                    position: 'relative',
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background:
                      'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
                    border: '1px solid var(--erd-border)',
                    cursor: 'pointer',
                    flexShrink: 0,
                    display: 'inline-block',
                  }}
                >
                  <input
                    type="color"
                    aria-label={t('groupSection.customColor')}
                    // Uncontrolled: the DBML is the source of truth, so we don't
                    // bind `value` (a controlled color input would revert the
                    // user's pick before onChange commits). The Radix menu
                    // remounts on each open, re-seeding from the current color.
                    defaultValue={/^#[0-9a-fA-F]{6}$/.test(group.color) ? group.color : '#000000'}
                    onChange={(e) => groupOps.onSetGroupColor(group.label, e.target.value)}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      padding: 0,
                      border: 'none',
                      opacity: 0,
                      cursor: 'pointer',
                    }}
                  />
                </label>
              </div>
              <DropdownMenuItem onSelect={() => groupOps.onSetGroupColor(group.label, null)}>
                {t('groupSection.defaultColor')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  renamingRef.current = true
                  setRenameValue(group.label)
                  setRenaming(true)
                }}
              >
                {t('groupSection.rename')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setConfirmDelete(true)}>
                {t('groupSection.delete')}
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
            ref={isSelected ? selectedRowRef : undefined}
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
              // 좌우 margin으로 선택/hover 하이라이트가 패널 양끝에 붙지 않게 inset.
              padding: '8px 8px 8px 27px',
              marginLeft: 6,
              marginRight: 6,
              cursor: 'pointer',
              // radius는 디자인 토큰(--radius-lg) 사용(버튼 계열과 동일 출처).
              borderRadius: 'var(--radius-lg)',
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
                    aria-label={t('groupSection.moveTable')}
                  >
                    <MoreHorizontal size={12} />
                  </button>
                </DropdownMenuTrigger>
                {/* Menu content is portalled in the DOM but stays a React-tree
                    child of this clickable row, so a menu-item click bubbles
                    (React synthetic events) up to the row's onClick and would
                    select the table — auto-expanding its group. Stop it here. */}
                <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuLabel>{t('groupSection.moveTo')}</DropdownMenuLabel>
                  {moveTargets.map((n) => (
                    <DropdownMenuItem key={n} onSelect={() => groupOps.onMoveTable(table.id, n)}>
                      {n}
                    </DropdownMenuItem>
                  ))}
                  {currentGroup !== null && (
                    <DropdownMenuItem onSelect={() => groupOps.onMoveTable(table.id, null)}>
                      {t('groupSection.ungrouped')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )
      })}

      {groupOps && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          testId={`group-delete-confirm-${group.key}`}
          title={t('groupSection.deleteConfirmTitle')}
          description={t('groupSection.deleteConfirmDesc', { name: group.label })}
          onConfirm={() => groupOps.onDeleteGroup(group.label)}
        />
      )}
    </div>
  )
}
