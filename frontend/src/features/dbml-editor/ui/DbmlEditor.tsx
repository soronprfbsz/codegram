import { forwardRef, useCallback } from 'react'
import CodeMirror, {
  type ReactCodeMirrorRef,
} from '@uiw/react-codemirror'

export interface DbmlEditorProps {
  /** Editor document text (the project's dbml_text). Controlled value. */
  value: string
  /** Called with the full document text on every edit. */
  onChange: (text: string) => void
  /** CSS height of the editor surface. */
  height?: string
}

/**
 * Controlled CodeMirror 6 editor bound to a string value/onChange — a drop-in
 * replacement for the Plan 2 <textarea>. @uiw/react-codemirror applies an
 * external `value` change via a minimal doc transaction, so re-seeding on a
 * project switch does not jump the cursor. Plain text only: DBML syntax
 * highlighting is out of scope for Plan 3a (no Lezer/StreamLanguage). The ref
 * is forwarded to the underlying CodeMirror (ReactCodeMirrorRef) so callers/
 * tests can reach the EditorView (e.g. view.dispatch).
 * features layer: depends on shared + CodeMirror (FSD downward imports).
 */
export const DbmlEditor = forwardRef<ReactCodeMirrorRef, DbmlEditorProps>(
  function DbmlEditor({ value, onChange, height = '70vh' }, ref) {
    const handleChange = useCallback(
      (val: string) => onChange(val),
      [onChange],
    )

    return (
      <div data-testid="dbml-editor" className="rounded border">
        <CodeMirror
          ref={ref}
          value={value}
          onChange={handleChange}
          height={height}
          width="100%"
          theme="light"
          extensions={[]}
          basicSetup={{
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
          }}
        />
      </div>
    )
  },
)
