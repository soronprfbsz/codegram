import { forwardRef, useCallback, useEffect, useRef } from 'react'
import CodeMirror, {
  type ReactCodeMirrorRef,
} from '@uiw/react-codemirror'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useThemeStore } from '@/shared/store/theme'
import { dbmlLanguage } from '../lib/dbml-language'
import { tableLineRange } from '../lib/tableLineRange'
import {
  activeTableField,
  setActiveTableRange,
} from '../lib/activeTableDecoration'

// Hoisted so their identity is stable across EditorPage's per-keystroke and
// per-status re-renders — otherwise @uiw/react-codemirror's reconfigure effect
// (keyed on these props by reference) rebuilds the basic-setup extensions and
// re-dispatches them every render, janking the typing hot path.
const EDITOR_EXTENSIONS: Extension[] = [
  EditorView.contentAttributes.of({ 'aria-label': 'DBML editor' }),
  dbmlLanguage,
  activeTableField,
]
const EDITOR_BASIC_SETUP = {
  lineNumbers: true,
  highlightActiveLineGutter: true,
  foldGutter: false,
  dropCursor: true,
  allowMultipleSelections: true,
  indentOnInput: true,
  bracketMatching: false,
  closeBrackets: false,
  autocompletion: false,
  rectangularSelection: true,
  highlightSelectionMatches: false,
  searchKeymap: false,
} as const

export interface DbmlEditorProps {
  /** Editor document text (the project's dbml_text). Controlled value. */
  value: string
  /** Called with the full document text on every edit. */
  onChange: (text: string) => void
  /** CSS height of the editor surface. */
  height?: string
  /**
   * Selected table name — when set, the editor scrolls to that table's block
   * and applies the cm-active-table decoration to each line in the block.
   * Pass null (or omit) to clear any active block highlight.
   */
  selectedTable?: string | null
}

/**
 * Controlled CodeMirror 6 editor bound to a string value/onChange. Adds:
 * - DBML syntax highlighting (dbmlLanguage extension)
 * - Active-table block decoration (activeTableField + setActiveTableRange)
 * - Theme-aware rendering (dark/light via useThemeStore)
 * - Auto-scroll to selectedTable's block when prop changes
 *
 * The ref is forwarded to the underlying ReactCodeMirrorRef so callers/tests
 * can reach the EditorView (e.g. view.dispatch).
 * features layer: depends on shared + CodeMirror (FSD downward imports).
 */
export const DbmlEditor = forwardRef<ReactCodeMirrorRef, DbmlEditorProps>(
  function DbmlEditor({ value, onChange, height = '70vh', selectedTable }, ref) {
    const handleChange = useCallback(
      (val: string) => onChange(val),
      [onChange],
    )

    const { theme } = useThemeStore()

    // Keep an internal ref to the EditorView so we can dispatch decoration +
    // scroll effects imperatively when selectedTable changes.
    const viewRef = useRef<EditorView | null>(null)

    const handleCreateEditor = useCallback((view: EditorView) => {
      viewRef.current = view
    }, [])

    // Sync active-block decoration + scroll whenever selectedTable or value
    // changes. Guards: view must be ready; range must be in-doc bounds.
    useEffect(() => {
      const view = viewRef.current
      if (!view) return

      const range = selectedTable ? tableLineRange(value, selectedTable) : null

      // Dispatch the decoration update.
      view.dispatch({ effects: setActiveTableRange.of(range) })

      // Scroll so the block's first line sits ~10px from the top of the
      // visible area, only when a valid block was found.
      if (range) {
        const docLines = view.state.doc.lines
        const clampedLine = Math.max(1, Math.min(docLines, range.fromLine))
        try {
          const linePos = view.state.doc.line(clampedLine).from
          view.dispatch({
            effects: EditorView.scrollIntoView(linePos, {
              y: 'start',
              yMargin: 10,
            }),
          })
        } catch {
          // Line out of range — ignore (doc may be mid-update).
        }
      }
    }, [selectedTable, value])

    return (
      <div data-testid="dbml-editor" className="h-full overflow-hidden rounded border">
        <CodeMirror
          ref={ref}
          value={value}
          onChange={handleChange}
          onCreateEditor={handleCreateEditor}
          height={height}
          width="100%"
          className="h-full"
          theme={theme === 'dark' ? 'dark' : 'light'}
          extensions={EDITOR_EXTENSIONS}
          basicSetup={EDITOR_BASIC_SETUP}
        />
      </div>
    )
  },
)
