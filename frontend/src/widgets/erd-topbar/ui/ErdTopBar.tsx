import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AutosaveStatus } from '@/features/project-autosave'
import { shortEmail } from '@/shared/lib/email'

export interface ErdTopBarProps {
  /** Project glyph badge (a `<ProjectGlyph/>`) shown left of the title. */
  glyph?: ReactNode
  /** The project's display name — shown as the main title. */
  projectName: string
  /**
   * The parsed DBML `Project` block name (leads the subline: "<name> · public").
   * Omitted when no Project block is present in the schema.
   */
  projectMeta?: string
  /** Autosave lifecycle state (colours the dot beside the title). */
  autosaveStatus: AutosaveStatus
  /** ISO timestamp of the project's last save (updated_at). When present and
   *  not mid-save, the subline stamps this instead of a bare "saved" label. */
  lastModified?: string
  /** Email of whoever wrote that save — named beside the time on the subline. */
  lastEditedBy?: string
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

/** Save state as a colour, beside the title. */
function SaveDot({ status }: { status: AutosaveStatus }) {
  const background =
    status === 'error'
      ? 'var(--erd-error)'
      : status === 'saving'
        ? 'var(--erd-text-3)'
        : 'var(--erd-success)'
  return (
    <span
      aria-hidden
      data-testid="save-dot"
      style={{ width: 6, height: 6, borderRadius: '50%', background, flexShrink: 0 }}
    />
  )
}

/**
 * Save state as the title's second line, not a control on the right.
 *
 * Beside the mode switch the stamp read as one more control competing for the
 * same corner. Under the title it is plainly a property OF this project: the
 * dot next to the name carries the state, the line under it carries when and
 * by whom. The DBML `Project` block name rides in front of it — same line, one
 * `·` — so the identity block still says everything it used to.
 *
 * Who saved matters because this document is shared: "마지막 저장 …" alone
 * cannot tell you whether the version you are reading is your own work or a
 * colleague's. Only the local part shows (a full work address would swallow the
 * line); the whole address stays in the tooltip.
 */
function ProjectSubline({
  status,
  lastModified,
  lastEditedBy,
  projectMeta,
}: {
  status: AutosaveStatus
  lastModified?: string
  lastEditedBy?: string
  projectMeta?: string
}) {
  const { t, i18n } = useTranslation()
  const settled = status === 'idle' || status === 'saved'
  const when = lastModified ? formatLastModified(lastModified, i18n.language) : null

  const save =
    status === 'saving'
      ? t('topbar.saving')
      : status === 'error'
        ? t('topbar.saveFailed')
        : settled && when
          ? lastEditedBy
            ? t('topbar.lastSavedBy', { time: when, who: shortEmail(lastEditedBy) })
            : t('topbar.lastSaved', { time: when })
          : t('topbar.saved')
  // The full address, only when the line is actually showing a shortened one.
  const title =
    settled && when && lastEditedBy
      ? t('topbar.lastSavedBy', { time: when, who: lastEditedBy })
      : undefined

  return (
    <div
      title={title}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 6,
        fontSize: 'var(--erd-fs-sm)',
        color: status === 'error' ? 'var(--erd-error)' : 'var(--erd-text-3)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {projectMeta && (
        <>
          <span style={{ fontFamily: 'var(--font-mono, ui-monospace)' }}>
            {projectMeta} · public
          </span>
          <span aria-hidden>·</span>
        </>
      )}
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{save}</span>
    </div>
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
 * Presentational: receives all data + slots from the page. Renders the 64px
 * bar. The global sidebar owns brand / navigation / account / theme. The bar
 * carries project identity over its save state, and the right-side controls: table
 * search, 정보 / 버전 기록 toggles (mutually exclusive panels), Import (SQL /
 * DB sync), and the Export menu.
 */
export function ErdTopBar({
  glyph,
  projectName,
  projectMeta,
  autosaveStatus,
  lastModified,
  lastEditedBy,
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
        gap: 16,
        height: 64,
        padding: '0 18px',
        flexShrink: 0,
        background: 'var(--erd-surface)',
        borderBottom: '1px solid var(--erd-border)',
        zIndex: 6,
      }}
    >
      {/* Title block — project glyph + identity over save state (sidebar toggle
          lives in the sidebar; DBML toggle in the DBML pane). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {glyph}
        <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div
              style={{
                fontSize: 'var(--erd-fs-lg)',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: 'var(--erd-text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              role="heading"
              aria-level={1}
            >
              {projectName}
            </div>
            <SaveDot status={autosaveStatus} />
          </div>
          <ProjectSubline
            status={autosaveStatus}
            lastModified={lastModified}
            lastEditedBy={lastEditedBy}
            projectMeta={projectMeta}
          />
        </div>
      </div>

      {/* Right side, in two groups: what this session IS (the mode switch),
          then what it can DO (search, panels, import/export). The hairline keeps
          the mode switch from reading as one more button. Search takes whatever
          width the bar has spare. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flex: 1,
          minWidth: 0,
          justifyContent: 'flex-end',
        }}
      >
        {lockStatus}
        <BarDivider />
        {/* Direct child, so its `flex` competes here rather than inside a
            wrapper — otherwise the spare width pools in front of the field
            and tears the hairline away from it. */}
        {searchBox}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {infoButton}
          {historyButton}
          {importMenu}
          {exportMenu}
        </div>
      </div>
    </header>
  )
}
