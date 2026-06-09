import type { DbmlSchema } from '@/entities/dbml'
import { deriveDisplayGroups } from '@/entities/erd'

export interface ErdInfoPanelProps {
  schema: DbmlSchema | undefined
  /** Name of the currently selected table (for row highlight). */
  selected: string | null
  /** Called when a table row is clicked. */
  onSelect: (tableName: string) => void
  /** DBML Project database_type value, when available. */
  dialect?: string
}

/** Shared `panel-head` header row (44px, `--erd-border` bottom). */
function PanelHead({ label }: { label: string }) {
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
        }}
      >
        {label}
      </span>
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
export function ErdInfoPanel({ schema, selected, onSelect, dialect }: ErdInfoPanelProps) {
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        height: '100%',
      }}
    >
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
      <PanelHead label="Table names" />

      {/* Scrollable list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {displayGroups.length === 0 && (
          <div
            style={{ padding: '16px 14px', fontSize: 12, color: 'var(--erd-text-3)' }}
          >
            No tables
          </div>
        )}

        {displayGroups.map((group) => (
          <div key={group.key}>
            {/* Section label: glyph in group color + label, 10px uppercase 600 */}
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
              <span
                style={{
                  color: group.color,
                  fontFamily: 'var(--font-mono, ui-monospace)',
                  fontSize: 10,
                  opacity: 0.85,
                }}
              >
                {group.glyph}
              </span>
              {group.label}
            </div>

            {/* Table rows */}
            {group.tables.map((table) => {
              const isSelected = selected === table.name
              return (
                <div
                  key={table.id}
                  role="button"
                  tabIndex={0}
                  data-testid={`tablelist-row-${table.name}`}
                  onClick={() => onSelect(table.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(table.name)
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 14px',
                    cursor: 'pointer',
                    borderRadius: 8,
                    transition: 'background 80ms ease',
                    background: isSelected
                      ? 'var(--erd-accent-soft)'
                      : undefined,
                    fontSize: 13,
                  }}
                  className={isSelected ? 'tlist-item-selected' : 'tlist-item'}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      ;(e.currentTarget as HTMLDivElement).style.background =
                        'var(--erd-hover)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLDivElement).style.background = isSelected
                      ? 'var(--erd-accent-soft)'
                      : ''
                  }}
                >
                  {/* Glyph in group color */}
                  <span
                    style={{
                      color: group.color,
                      fontFamily: 'var(--font-mono, ui-monospace)',
                      fontSize: 11,
                      width: 18,
                      textAlign: 'center' as const,
                      flexShrink: 0,
                    }}
                  >
                    {group.glyph}
                  </span>

                  {/* Table name mono 12.5px */}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono, ui-monospace)',
                      fontSize: 12.5,
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap' as const,
                    }}
                  >
                    {table.name}
                  </span>

                  {/* Field count in --erd-text-3 */}
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--erd-text-3)',
                      fontFamily: 'var(--font-mono, ui-monospace)',
                    }}
                  >
                    {table.columns.length}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
