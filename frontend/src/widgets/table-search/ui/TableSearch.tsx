import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import type { DbmlSchema } from '@/entities/dbml'
import { searchTables } from '@/entities/dbml'
import { topbarFrameStyle, TOPBAR_ICON_SIZE, TOPBAR_ICON_STROKE } from '@/shared/ui/topbar-control'

export interface TableSearchProps {
  /** Current schema (search source). When undefined, search yields nothing. */
  schema?: DbmlSchema
  /**
   * Navigate to a chosen table — selects the node, scrolls the DBML editor, and
   * centers the canvas, plus highlights the matched columns. Same contract the
   * info panel's search used.
   */
  onNavigate: (tableId: string, matchedColumnIds: string[]) => void
}

/**
 * Topbar table search — a combobox: type to find tables by name/column/note,
 * results show in a dropdown, ↑/↓ moves the cursor, Enter/click navigates.
 *
 * Decoupled from the info panel (which is hidden by default): selecting a result
 * jumps the canvas regardless of whether any side panel is open.
 */
export function TableSearch({ schema, onNavigate }: TableSearchProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const active = query.trim().length > 0
  const matches = useMemo(
    () => (active ? searchTables(schema, query) : new Map()),
    [active, schema, query],
  )
  // Matching tables in schema declaration order, with name + match metadata.
  const results = useMemo(
    () =>
      active && schema
        ? schema.tables
            .filter((t) => matches.has(t.id))
            .map((t) => ({ id: t.id, name: t.name, match: matches.get(t.id)! }))
        : [],
    [active, schema, matches],
  )

  // activeIndex resets whenever the query changes.
  useEffect(() => setActiveIndex(0), [query])

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
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function navigate(tableId: string) {
    onNavigate(tableId, matches.get(tableId)?.matchedColumnIds ?? [])
    setQuery('')
    inputRef.current?.blur()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const t = results[activeIndex] ?? results[0]
      if (t) navigate(t.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (query) setQuery('')
      else inputRef.current?.blur()
    }
  }

  const open = active && results.length >= 0

  return (
    <div style={{ position: 'relative', width: 240, flexShrink: 0 }}>
      <div
        className="erd-search-frame"
        style={{
          ...topbarFrameStyle,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '0 10px',
        }}
      >
        <Search
          size={TOPBAR_ICON_SIZE}
          strokeWidth={TOPBAR_ICON_STROKE}
          style={{ color: 'var(--erd-text-3)', flexShrink: 0 }}
          aria-hidden
        />
        <input
          ref={inputRef}
          data-testid="table-search-input"
          value={query}
          placeholder={t('tableSearch.placeholder')}
          aria-label={t('tableSearch.searchAria')}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 'inherit',
            fontWeight: 400,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'inherit',
          }}
        />
        {active && (
          <button
            type="button"
            data-testid="table-search-clear"
            aria-label={t('tableSearch.clear')}
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
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

      {open && (
        <div
          data-testid="table-search-results"
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: 320,
            overflowY: 'auto',
            background: 'var(--erd-surface)',
            border: '1px solid var(--erd-border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            zIndex: 20,
            padding: 4,
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--erd-text-3)' }}>
              {t('tableSearch.noResults')}
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.id}
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                data-testid={`table-search-result-${r.name}`}
                onMouseEnter={() => setActiveIndex(i)}
                // mousedown (not click) so the input's blur doesn't close the
                // dropdown before the selection is committed.
                onMouseDown={(e) => {
                  e.preventDefault()
                  navigate(r.id)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 10px',
                  borderRadius: 5,
                  border: 'none',
                  cursor: 'pointer',
                  background: i === activeIndex ? 'var(--erd-hover)' : 'transparent',
                  color: 'inherit',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{r.name}</span>
                {r.match.hint && (
                  <span
                    data-testid={`table-search-hint-${r.name}`}
                    style={{ fontSize: 11, color: 'var(--erd-text-3)', marginLeft: 'auto' }}
                  >
                    {r.match.hint}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
