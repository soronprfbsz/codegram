import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { DbmlEditor } from './DbmlEditor'

describe('DbmlEditor', () => {
  it('renders a non-empty editor seeded with the value', () => {
    render(<DbmlEditor value="Table users { id int }" onChange={() => {}} />)

    const wrapper = screen.getByTestId('dbml-editor')
    expect(wrapper).not.toBeEmptyDOMElement()
    // CodeMirror renders the document text into the contenteditable lines.
    expect(wrapper.textContent).toContain('Table users')
    // The editing surface carries an accessible name.
    expect(
      wrapper.querySelector('.cm-content[aria-label="DBML editor"]'),
    ).not.toBeNull()
  })

  it('calls onChange when the document content changes', () => {
    const onChange = vi.fn()
    let cmRef: ReactCodeMirrorRef | null = null
    render(
      <DbmlEditor
        value=""
        onChange={onChange}
        ref={(r) => {
          cmRef = r
        }}
      />,
    )

    // Drive a real CodeMirror edit through the EditorView's transaction API.
    // This is the deterministic path that fires onChange under jsdom (a
    // synthetic 'input' event on .cm-content does NOT — CodeMirror's DOM
    // observer needs a real layout that jsdom does not provide).
    cmRef!.view!.dispatch({ changes: { from: 0, insert: 'Table x' } })

    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls.at(-1)?.[0]).toContain('Table x')
  })

  it('renders without crashing when selectedTable matches a block in the doc', () => {
    // Integration smoke test: the decoration + scroll path runs without error.
    const doc = 'Table users {\n  id int [pk]\n}\n\nTable posts {\n  id int [pk]\n}'
    expect(() => {
      render(
        <DbmlEditor
          value={doc}
          onChange={() => {}}
          selectedTable="users"
        />,
      )
    }).not.toThrow()

    // The editor still renders and contains the document text.
    const wrapper = screen.getByTestId('dbml-editor')
    expect(wrapper.textContent).toContain('Table users')
  })

  it('renders without crashing when selectedTable does not match any block', () => {
    expect(() => {
      render(
        <DbmlEditor
          value="Table users {\n  id int\n}"
          onChange={() => {}}
          selectedTable="nonexistent"
        />,
      )
    }).not.toThrow()
  })

  it('renders without crashing when selectedTable is null (cleared selection)', () => {
    expect(() => {
      render(
        <DbmlEditor
          value="Table users {\n  id int\n}"
          onChange={() => {}}
          selectedTable={null}
        />,
      )
    }).not.toThrow()
  })
})
