import type { ReactNode } from 'react'
import { Info, Upload, ArrowLeft, RefreshCw } from 'lucide-react'
import logomarkUrl from '@/shared/assets/logomark.svg'
import { ThemeToggle } from '@/shared/ui/ThemeToggle'
import type { AutosaveStatus } from '@/features/project-autosave'

export interface ErdTopBarProps {
  /** The project's display name — shown as the main title. */
  projectName: string
  /**
   * The parsed DBML `Project` block name (used as subtitle: "<name> · public").
   * Omitted when no Project block is present in the schema.
   */
  projectMeta?: string
  /** Autosave lifecycle state (drives the Save pill). */
  autosaveStatus: AutosaveStatus
  /** Opens the SQL import dialog. */
  onImportSql: () => void
  /** Navigates back (e.g. to the home page). */
  onBack: () => void
  /**
   * Called when the Info button is clicked.
   * In Phase 2 the right column always shows SchemaSummary, so this is a
   * no-op affordance — wired for future use (Phase 3+).
   */
  onInfo?: () => void
  /** Triggers a DB → DBML sync (wired to the sync dialog in Task 3). */
  onSync: () => void
  /** The Export menu rendered in the actions group (passed as a child slot). */
  exportMenu: ReactNode
}

/** Dot + label for the save pill. */
function SavePill({ status }: { status: AutosaveStatus }) {
  const dot =
    status === 'idle' || status === 'saved' ? (
      <span
        style={{ width: 7, height: 7, borderRadius: '50%', background: '#17B26A', flexShrink: 0 }}
      />
    ) : null

  const label =
    status === 'saving'
      ? 'Saving…'
      : status === 'error'
        ? 'Save failed'
        : '저장됨'

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
 * TopBar widget for the ERD editor (Phase 2).
 *
 * Presentational: receives all data + handlers from the page. Renders the
 * 56px bar per the Backstage 시안 1 spec:
 *   Logo · Title block · DBML badge · [spacer] · Save pill · ThemeToggle ·
 *   [separator] · Info · Import SQL · Export · Back
 */
export function ErdTopBar({
  projectName,
  projectMeta,
  autosaveStatus,
  onImportSql,
  onBack,
  onInfo,
  onSync,
  exportMenu,
}: ErdTopBarProps) {
  // Shared secondary button styles (README §Buttons)
  const btnSecondary: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1,
    background: 'var(--erd-surface)',
    border: '1px solid var(--erd-border-2)',
    color: 'var(--erd-text)',
    borderRadius: 8,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    fontFamily: 'inherit',
    transition: 'background 80ms ease, border-color 80ms ease',
  }

  const btnGhost: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1,
    background: 'transparent',
    border: '1px solid transparent',
    color: 'var(--erd-text-2)',
    borderRadius: 8,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    fontFamily: 'inherit',
    transition: 'background 80ms ease, color 80ms ease',
  }

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        height: 56,
        padding: '0 18px',
        flexShrink: 0,
        background: 'var(--erd-surface)',
        borderBottom: '1px solid var(--erd-border)',
        zIndex: 6,
      }}
    >
      {/* Logo */}
      <img
        src={logomarkUrl}
        alt=""
        style={{ width: 26, height: 26, borderRadius: 6, display: 'block' }}
      />

      {/* Title block */}
      <div>
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

      {/* DBML badge */}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '2px 8px',
          borderRadius: 9999,
          fontSize: 11,
          fontWeight: 500,
          lineHeight: '18px',
          background: 'var(--erd-hover)',
          color: 'var(--erd-text-2)',
          boxShadow: 'inset 0 0 0 1px var(--erd-border)',
          marginLeft: 4,
        }}
      >
        DBML
      </span>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Actions group */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Save pill */}
        <SavePill status={autosaveStatus} />

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Separator */}
        <span
          style={{
            width: 1,
            height: 24,
            background: 'var(--erd-border)',
            flexShrink: 0,
          }}
          aria-hidden
        />

        {/* Info button */}
        <button
          type="button"
          className="erd-topbar-btn"
          style={btnSecondary}
          onClick={onInfo}
          aria-label="Info"
        >
          <Info size={15} strokeWidth={2} />
          Info
        </button>

        {/* Import SQL button */}
        <button
          type="button"
          className="erd-topbar-btn"
          style={btnSecondary}
          onClick={onImportSql}
          aria-label="Import SQL"
        >
          <Upload size={15} strokeWidth={2} />
          Import SQL
        </button>

        {/* Sync from DB button */}
        <button
          type="button"
          className="erd-topbar-btn"
          style={btnSecondary}
          onClick={onSync}
          aria-label="Sync from DB"
        >
          <RefreshCw size={15} strokeWidth={2} />
          Sync from DB
        </button>

        {/* Export menu (rendered by page) */}
        {exportMenu}

        {/* Back button */}
        <button
          type="button"
          className="erd-topbar-btn"
          style={btnGhost}
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeft size={15} strokeWidth={2} />
          Back
        </button>
      </div>
    </header>
  )
}
