import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AutosaveStatus } from '@/features/project-autosave'

export interface ErdTopBarProps {
  /** Project glyph badge (a `<ProjectGlyph/>`) shown left of the title. */
  glyph?: ReactNode
  /** The project's display name — shown as the main title. */
  projectName: string
  /**
   * The parsed DBML `Project` block name (used as subtitle: "<name> · public").
   * Omitted when no Project block is present in the schema.
   */
  projectMeta?: string
  /** Autosave lifecycle state (drives the Save pill). */
  autosaveStatus: AutosaveStatus
  /**
   * The Export control (an `<ExportMenu/>`) rendered on the right — the single
   * export hub for the open project (preview · Diagram · Table Doc · SQL).
   */
  exportMenu?: ReactNode
  /** Import source menu (Import SQL / DB sync), rendered left of Export. */
  importMenu?: ReactNode
  /** Table search combobox, rendered at the start of the right group. */
  searchBox?: ReactNode
  /** Info-panel toggle (an info icon button) rendered on the right. */
  infoButton?: ReactNode
  /** Snapshot-history toggle (a clock icon button) rendered on the right. */
  historyButton?: ReactNode
  /** Edit-lock status (read-only / "editing: X" / takeover), left of the Save pill. */
  lockStatus?: ReactNode
}

/** Dot + label for the save pill. */
function SavePill({ status }: { status: AutosaveStatus }) {
  const { t } = useTranslation()
  const dot =
    status === 'idle' || status === 'saved' ? (
      <span
        style={{ width: 7, height: 7, borderRadius: '50%', background: '#17B26A', flexShrink: 0 }}
      />
    ) : null

  const label =
    status === 'saving'
      ? t('topbar.saving')
      : status === 'error'
        ? t('topbar.saveFailed')
        : t('topbar.saved')

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: 'var(--erd-text-2)',
        padding: '4px 10px',
        borderRadius: 9999,
      }}
    >
      {dot}
      {label}
    </span>
  )
}

/**
 * TopBar widget for the ERD editor.
 *
 * Presentational: receives all data + slots from the page. Renders the 56px
 * bar. The global sidebar owns brand / navigation / account / theme. The bar
 * carries project identity, the Save pill, and the right-side controls: table
 * search, 정보 / 버전 기록 toggles (mutually exclusive panels), Import (SQL /
 * DB sync), and the Export menu.
 */
export function ErdTopBar({
  glyph,
  projectName,
  projectMeta,
  autosaveStatus,
  exportMenu,
  importMenu,
  searchBox,
  infoButton,
  historyButton,
  lockStatus,
}: ErdTopBarProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        height: 56,
        padding: '0 18px',
        flexShrink: 0,
        background: 'var(--erd-surface)',
        borderBottom: '1px solid var(--erd-border)',
        zIndex: 6,
      }}
    >
      {/* Title block — project glyph + identity (sidebar toggle lives in the
          sidebar; DBML toggle in the DBML pane). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {glyph}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'var(--erd-text)',
            }}
            role="heading"
            aria-level={1}
          >
            {projectName}
          </div>
          {projectMeta && (
            <div
              style={{
                fontSize: 12,
                fontFamily: 'var(--font-mono, ui-monospace)',
                color: 'var(--erd-text-3)',
              }}
            >
              {projectMeta} · public
            </div>
          )}
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right group: 검색 + Save pill + 정보 + 버전 기록 + Import + Export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {searchBox}
        {lockStatus}
        <SavePill status={autosaveStatus} />
        {infoButton}
        {historyButton}
        {importMenu}
        {exportMenu}
      </div>
    </header>
  )
}
