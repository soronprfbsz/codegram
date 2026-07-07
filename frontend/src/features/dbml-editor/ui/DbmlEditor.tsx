import { forwardRef, memo, useCallback, useEffect, useRef } from 'react'
import CodeMirror, {
  type ReactCodeMirrorRef,
} from '@uiw/react-codemirror'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import type { DbmlParseError } from '@/entities/dbml'
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
  // Gutter markers + the lint state field that setDiagnostics() writes to, so
  // parse errors show as a gutter dot + underline + hover tooltip on the line.
  lintGutter(),
]

/**
 * Map our parse errors (1-based line/column) to CodeMirror diagnostics.
 * An error with a valid line underlines from its column to the line end; one
 * without usable position info falls back to marking the first line.
 */
function toDiagnostics(
  doc: EditorView['state']['doc'],
  errors: DbmlParseError[],
): Diagnostic[] {
  return errors.map((e) => {
    if (typeof e.line === 'number' && e.line >= 1 && e.line <= doc.lines) {
      const ln = doc.line(e.line)
      const col = typeof e.column === 'number' && e.column >= 1 ? e.column : 1
      const from = Math.min(ln.from + col - 1, ln.to)
      const to = ln.to > from ? ln.to : Math.min(doc.length, from + 1)
      return { from, to: Math.max(to, from), severity: 'error', message: e.message }
    }
    const ln = doc.line(1)
    return { from: ln.from, to: ln.to, severity: 'error', message: e.message }
  })
}
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
  /**
   * Parse errors to surface in the gutter/underline. When the latest parse
   * succeeded (or is pending) pass none/empty to clear the markers.
   */
  errors?: DbmlParseError[]
  /**
   * Imperative "jump to position" request. Set a new object (changed `nonce`)
   * to scroll + move the cursor to `line`/`column`; repeated jumps to the same
   * spot re-fire because the nonce changes. Null/omit to do nothing.
   */
  gotoLine?: { line: number; column?: number; nonce: number } | null
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
const DbmlEditorImpl = forwardRef<ReactCodeMirrorRef, DbmlEditorProps>(
  function DbmlEditor(
    { value, onChange, height = '70vh', selectedTable, errors, gotoLine },
    ref,
  ) {
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

    // Keep the active-block decoration aligned as the selection OR the text
    // changes (editing shifts the block's lines). Decoration only — no scroll,
    // so it never moves the viewport/cursor while the user types.
    useEffect(() => {
      const view = viewRef.current
      if (!view) return
      const range = selectedTable ? tableLineRange(value, selectedTable) : null
      view.dispatch({ effects: setActiveTableRange.of(range) })
    }, [selectedTable, value])

    // Scroll to the selected table's block ONLY when the selection itself
    // changes — NOT on every keystroke. Re-scrolling on `value` would yank the
    // viewport back to the selected table on each edit, so editing elsewhere
    // (e.g. adding a table to a TableGroup) kept jumping away from the cursor.
    // Reads the live doc from the view so `value` need not be a dependency.
    useEffect(() => {
      const view = viewRef.current
      if (!view || !selectedTable) return
      const range = tableLineRange(view.state.doc.toString(), selectedTable)
      if (!range) return
      const docLines = view.state.doc.lines
      const clampedLine = Math.max(1, Math.min(docLines, range.fromLine))
      try {
        const linePos = view.state.doc.line(clampedLine).from
        view.dispatch({
          effects: EditorView.scrollIntoView(linePos, { y: 'start', yMargin: 10 }),
        })
      } catch {
        // Line out of range — ignore (doc may be mid-update).
      }
    }, [selectedTable])

    // Push parse errors into CodeMirror as diagnostics (gutter + underline +
    // tooltip). Empty/none clears them. `value` is a dep so offsets are remapped
    // against the current document.
    useEffect(() => {
      const view = viewRef.current
      if (!view) return
      view.dispatch(setDiagnostics(view.state, toDiagnostics(view.state.doc, errors ?? [])))
    }, [errors, value])

    // Jump to a requested line/column (e.g. clicking a parse-error row): move
    // the cursor there, scroll it into the center, and focus the editor.
    useEffect(() => {
      const view = viewRef.current
      if (!view || !gotoLine) return
      const doc = view.state.doc
      if (gotoLine.line < 1 || gotoLine.line > doc.lines) return
      const ln = doc.line(gotoLine.line)
      const col = typeof gotoLine.column === 'number' ? Math.max(1, gotoLine.column) : 1
      const pos = Math.min(ln.from + col - 1, ln.to)
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: 'center' }),
      })
      view.focus()
    }, [gotoLine])

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

// Memo boundary: page-level selectionInfo churn during edge drags must not
// re-render the editor (all props are referentially stable mid-drag).
export const DbmlEditor = memo(DbmlEditorImpl)
