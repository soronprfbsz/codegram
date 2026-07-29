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
  /** ISO timestamp of the project's last save (updated_at). When present and
   *  not mid-save, the pill shows this instead of a bare "saved" label. */
  lastModified?: string
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

/** Format an ISO timestamp as a compact localized date+time for the save pill. */
function formatLastModified(iso: string, locale: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * Save state as a timestamp, not a sentence.
 *
 * "최종 수정 26. 7. 28. 오전 9:34" spelled the label out next to the mode
 * switch and read as a competing control. The dot already says "saved", so the
 * visible text is the bare time and the full sentence moves to the tooltip;
 * saving / failed still speak, because those are events rather than status.
 */
function SaveStamp({ status, lastModified }: { status: AutosaveStatus; lastModified?: string }) {
  const { t, i18n } = useTranslation()
  const settled = status === 'idle' || status === 'saved'
  const when = lastModified ? formatLastModified(lastModified, i18n.language) : null

  const text =
    status === 'saving'
      ? t('topbar.saving')
      : status === 'error'
        ? t('topbar.saveFailed')
        : (when ?? t('topbar.saved'))
  const title =
    settled && when ? t('topbar.lastSaved', { time: when }) : undefined

  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 'var(--erd-fs-sm)',
        fontVariantNumeric: 'tabular-nums',
        color: status === 'error' ? 'var(--erd-error)' : 'var(--erd-text-3)',
        whiteSpace: 'nowrap',
      }}
    >
      {settled && (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--erd-success)',
            flexShrink: 0,
          }}
        />
      )}
      {text}
    </span>
  )
}

/** Hairline between the session-state group and the action group. */
function BarDivider() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        height: 18,
        flexShrink: 0,
        background: 'var(--erd-border-2)',
      }}
    />
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
  lastModified,
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
              fontSize: 'var(--erd-fs-lg)',
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
                fontSize: 'var(--erd-fs-sm)',
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

      {/* Right side, in two groups: what this session IS (mode switch + save
          state), then what it can DO (search, panels, import/export). The
          hairline keeps the mode switch from reading as one more button. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {lockStatus}
        <SaveStamp status={autosaveStatus} lastModified={lastModified} />
        <BarDivider />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {searchBox}
          {infoButton}
          {historyButton}
          {importMenu}
          {exportMenu}
        </div>
      </div>
    </header>
  )
}
