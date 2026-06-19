import type { ReactNode } from 'react'
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
  /**
   * The Diagram export control (a `<DiagramExportMenu/>`) rendered on the right.
   * Diagram capture needs the live canvas, so it stays in the editor; Table Doc
   * /SQL export and Import live elsewhere now (ADR-0013).
   */
  diagramExport?: ReactNode
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
 * TopBar widget for the ERD editor.
 *
 * Presentational: receives all data + slots from the page. Renders the 56px
 * bar. The global sidebar owns brand / navigation / account / theme; the DBML
 * pane header owns Import (SQL / DB sync) and the info panel owns its own
 * collapse, so the bar is slim: the project identity, the Save pill, and the
 * Diagram export control.
 */
export function ErdTopBar({
  projectName,
  projectMeta,
  autosaveStatus,
  diagramExport,
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
      {/* Title block (sidebar toggle lives in the sidebar; DBML toggle in the
          DBML pane — the bar carries only project identity + diagram export). */}
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

      {/* Right group: Save pill + Diagram export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SavePill status={autosaveStatus} />
        {diagramExport}
      </div>
    </header>
  )
}
