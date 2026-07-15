import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, PanelRightClose, FolderCog } from 'lucide-react'
import type { DbmlSchema } from '@/entities/dbml'
import { synthesizedEnumChecks } from '@/entities/dbml'
import { deriveDisplayGroups } from '@/entities/erd'
import type { GroupOpHandlers } from '../model/types'
import { GroupSection } from './GroupSection'
import { ManageGroupsDialog } from './ManageGroupsDialog'

/** Shared style for the "Table names" header icon buttons (그룹 관리 / 생성). */
const HEADER_ICON_BTN: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 4,
  color: 'var(--erd-text-3)',
  display: 'flex',
  alignItems: 'center',
  borderRadius: 4,
}

export interface ErdInfoPanelProps {
  schema: DbmlSchema | undefined
  /** Name of the currently selected table (for row highlight). */
  selected: string | null
  /** Called when a table row is clicked, with the schema-qualified table id. */
  onSelect: (tableId: string) => void
  /** Group mutation callbacks. When omitted, renders in read-only mode. */
  groupOps?: GroupOpHandlers
  /** While false, mutation triggers are disabled. Defaults to true. */
  mutationsEnabled?: boolean
  /** Close (hide) the panel area. When omitted, the header close button is hidden. */
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
          fontSize: 14,
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
  groupOps,
  mutationsEnabled = true,
  onCollapse,
}: ErdInfoPanelProps) {
  const { t } = useTranslation()
  // Stat cells — safe to 0 when schema is undefined.
  const tables = schema?.tables.length ?? 0
  const refs = schema?.refs.length ?? 0
  const tableGroups = schema?.tableGroups.length ?? 0
  // Enum 수 = 네이티브 enum + enum형 CHECK 제약(예: `col = ANY(ARRAY[...])`)에서
  // 합성되는 enum. 캔버스의 합성 enum 노드와 동일한 단일 출처를 공유한다.
  const enums = (schema?.enums.length ?? 0) + (schema ? synthesizedEnumChecks(schema).length : 0)

  // [stable testid suffix, 표시 라벨(번역), 값] — testid는 언어와 무관하게 고정.
  const cells: [string, string, string | number][] = [
    ['tables', t('infoPanel.statTables'), tables],
    ['refs', t('infoPanel.statRefs'), refs],
    ['table-groups', t('infoPanel.statTableGroups'), tableGroups],
    ['enums', t('infoPanel.statEnums'), enums],
  ]

  const displayGroups = schema ? deriveDisplayGroups(schema) : []

  // Expand state: set of EXPANDED group keys. Default empty ⇒ every group
  // (and Ungrouped) starts collapsed; newly-added groups also start collapsed.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // "그룹 관리" 일괄 이동 모달 열림 상태
  const [manageOpen, setManageOpen] = useState(false)

  // Create group inline input state
  const [creating, setCreating] = useState(false)
  const [createValue, setCreateValue] = useState('')
  const [createError, setCreateError] = useState(false)

  // Named group names for Move-to targets
  const groupNames = displayGroups
    .filter((g) => g.key !== '__ungrouped')
    .map((g) => g.label)

  // 캔버스에서 테이블을 선택하면, 그 테이블이 속한 그룹이 접혀 있어도 펼쳐서
  // 선택된(하이라이트된) 행이 보이게 한다. (요청: 접힌 그룹도 열리며 선택)
  useEffect(() => {
    if (!selected || !schema) return
    const groups = deriveDisplayGroups(schema)
    const g = groups.find((grp) => grp.tables.some((t) => t.name === selected))
    if (g) setExpanded((prev) => (prev.has(g.key) ? prev : new Set(prev).add(g.key)))
  }, [selected, schema])

  function toggleCollapse(key: string) {
    setExpanded((prev) => {
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
      {/* ── Schema summary (패널 접기 버튼이 우측에) ───────────── */}
      <PanelHead
        label={t('infoPanel.schemaSummary')}
        actions={
          onCollapse ? (
            <button
              type="button"
              className="erd-topbar-btn"
              onClick={onCollapse}
              aria-label={t('infoPanel.closePanel')}
              title={t('infoPanel.closePanel')}
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 24,
                height: 24,
                flexShrink: 0,
                borderRadius: 4,
                border: 'none',
                background: 'transparent',
                color: 'var(--erd-text-3)',
                cursor: 'pointer',
              }}
            >
              <PanelRightClose size={15} strokeWidth={2} />
            </button>
          ) : undefined
        }
      />
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
          {cells.map(([id, label, value]) => (
            <div
              key={id}
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
                data-testid={`stat-${id}`}
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

      {/* ── Table groups ───────────────────────────── */}
      <PanelHead
        label={t('infoPanel.tableGroups')}
        actions={
          groupOps ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button
                data-testid="manage-groups-button"
                disabled={!mutationsEnabled}
                title={mutationsEnabled ? t('infoPanel.manageGroupsTooltip') : t('infoPanel.fixErrors')}
                onClick={() => setManageOpen(true)}
                style={{
                  ...HEADER_ICON_BTN,
                  cursor: mutationsEnabled ? 'pointer' : 'not-allowed',
                }}
                aria-label={t('infoPanel.manageGroups')}
              >
                <FolderCog size={14} />
              </button>
              <button
                data-testid="group-create-button"
                disabled={!mutationsEnabled}
                title={mutationsEnabled ? t('infoPanel.newGroup') : t('infoPanel.fixErrors')}
                onClick={() => {
                  setCreating(true)
                  setCreateValue('')
                  setCreateError(false)
                }}
                style={{
                  ...HEADER_ICON_BTN,
                  cursor: mutationsEnabled ? 'pointer' : 'not-allowed',
                }}
                aria-label={t('infoPanel.newGroup')}
              >
                <Plus size={14} />
              </button>
            </div>
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
              placeholder={t('infoPanel.groupNamePlaceholder')}
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
                {t('infoPanel.duplicateGroup')}
              </div>
            )}
          </div>
        )}

        {displayGroups.length === 0 && !creating && (
          <div
            style={{ padding: '16px 14px', fontSize: 12, color: 'var(--erd-text-3)' }}
          >
            {t('infoPanel.noTables')}
          </div>
        )}

        {displayGroups.map((group) => (
          <GroupSection
            key={group.key}
            group={group}
            groupNames={groupNames}
            selected={selected}
            onSelect={onSelect}
            collapsed={!expanded.has(group.key)}
            onToggleCollapse={() => toggleCollapse(group.key)}
            groupOps={groupOps}
            mutationsEnabled={mutationsEnabled}
          />
        ))}
      </div>

      {groupOps && (
        <ManageGroupsDialog
          open={manageOpen}
          onOpenChange={setManageOpen}
          schema={schema}
          groupOps={groupOps}
        />
      )}
    </div>
  )
}
