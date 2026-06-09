import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditorPage } from './index'
import * as project from '@/entities/project'
import * as autosave from '@/features/project-autosave'
import * as canvas from '@/features/erd-canvas'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import * as dbmlEditor from '@/features/dbml-editor'
import * as exportDiagramLib from '@/features/export-diagram/lib/exportDiagram'
import * as exportTableDoc from '@/features/export-table-doc'
import * as download from '@/shared/lib/download'
import type { DbmlSchema } from '@/entities/dbml'
import * as sqlImport from '@/features/sql-import'
import * as sqlExport from '@/features/sql-export'

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createMemoryRouter(
    [{ path: '/editor/:id', element: <EditorPage /> }],
    { initialEntries: ['/editor/p-1'] },
  )
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('EditorPage', () => {
  let autosaveSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.restoreAllMocks()
    autosaveSpy = vi
      .spyOn(autosave, 'useProjectAutosave')
      .mockReturnValue({ status: 'idle' })
  })

  it('shows the project name and seeds the editor with dbml_text', () => {
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        name: 'My Project',
        dbml_text: 'Table users {\n  id int [pk]\n}',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof project.useProject>)

    renderEditor()

    // TopBar renders the project name as an aria-level=1 heading (div)
    expect(
      screen.getByRole('heading', { name: 'My Project' }),
    ).toBeInTheDocument()

    // CodeMirror replaces the textarea: assert on the editor wrapper and
    // that it seeded the document text into the DOM.
    const editor = screen.getByTestId('dbml-editor')
    expect(editor).not.toBeEmptyDOMElement()
    expect(editor.textContent).toContain('Table users')
  })

  it('passes the preserved autosave contract { projectId, dbmlText, baseline }', () => {
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        name: 'My Project',
        dbml_text: 'Table users {\n  id int [pk]\n}',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof project.useProject>)

    renderEditor()

    // The seed effect runs after first render; the latest autosave call must
    // carry the exact Plan 2 contract with the seeded text + baseline.
    const lastCall = autosaveSpy.mock.calls.at(-1)?.[0] as {
      projectId: string
      dbmlText: string
      baseline?: string
    }
    expect(lastCall.projectId).toBe('p-1')
    expect(lastCall.dbmlText).toBe('Table users {\n  id int [pk]\n}')
    expect(lastCall.baseline).toBe('Table users {\n  id int [pk]\n}')
  })

  it('renders the TopBar Info button and SchemaSummary always visible in the right column', async () => {
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        name: 'My Project',
        dbml_text: '',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof project.useProject>)

    renderEditor()

    // In the 3-zone layout SchemaSummary lives in the right column (always
    // visible — not toggled). The right panel header says "Schema summary".
    // getAllByText handles the case where both the panel header and the
    // SchemaSummary Card title render the same text.
    expect(screen.getAllByText(/schema summary/i).length).toBeGreaterThanOrEqual(1)

    // The Info button is present in the TopBar as a styled affordance.
    const info = screen.getByRole('button', { name: /^info$/i })
    expect(info).toBeInTheDocument()

    // Clicking Info is a no-op in Phase 2 (right column is always shown),
    // but the button must not crash the page.
    const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })
    await user.click(info)
    // SchemaSummary still visible after click (it's not a toggle in Phase 2)
    expect(screen.getAllByText(/schema summary/i).length).toBeGreaterThanOrEqual(1)
  })

  it('mounts the ERD canvas region in the 3-zone layout', () => {
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        name: 'My Project',
        dbml_text: 'Table users {\n  id int [pk]\n}',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof project.useProject>)

    renderEditor()

    // The canvas is always mounted; before the debounced parse settles it
    // shows the empty-state placeholder. Either testid proves the center zone
    // includes the ERD canvas region.
    const cnv =
      screen.queryByTestId('erd-canvas') ??
      screen.queryByTestId('erd-canvas-empty')
    expect(cnv).toBeInTheDocument()
  })

  it('shows a not-found message when the project query errors', () => {
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof project.useProject>)

    renderEditor()
    expect(screen.getByText(/project not found/i)).toBeInTheDocument()
  })

  it('seeds layout from project.layout.positions into the autosave layout', () => {
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        name: 'My Project',
        dbml_text: 'Table users {\n  id int [pk]\n}',
        layout: {
          version: 1,
          positions: { 'public.users': { x: 320, y: 80 } },
        } as Record<string, unknown>,
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof project.useProject>)

    renderEditor()

    const lastCall = autosaveSpy.mock.calls.at(-1)?.[0] as {
      layout?: { version: number; positions: Record<string, unknown> }
      layoutBaseline?: { version: number; positions: Record<string, unknown> }
    }
    expect(lastCall.layout).toEqual({
      version: 1,
      positions: { 'public.users': { x: 320, y: 80 } },
    })
    expect(lastCall.layoutBaseline).toEqual({
      version: 1,
      positions: { 'public.users': { x: 320, y: 80 } },
    })
  })

  it('passes savedPositions + onLayoutChange to the ERD canvas', () => {
    // Spy the ErdCanvas to capture the props EditorPage threads to it.
    const erdSpy = vi
      .spyOn(canvas, 'ErdCanvas')
      .mockReturnValue(<div data-testid="erd-canvas-stub" />)

    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        name: 'My Project',
        dbml_text: 'Table users {\n  id int [pk]\n}',
        layout: { version: 1, positions: { 'public.users': { x: 1, y: 2 } } } as Record<string, unknown>,
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof project.useProject>)

    renderEditor()

    const props = erdSpy.mock.calls.at(-1)?.[0] as {
      savedPositions?: Record<string, unknown>
      onLayoutChange?: (l: unknown) => void
    }
    expect(props.savedPositions).toEqual({ 'public.users': { x: 1, y: 2 } })
    expect(typeof props.onLayoutChange).toBe('function')
  })
})

describe('EditorPage — Export menu wiring', () => {
  // A minimal normalized schema with a single `users` table carrying an
  // `email` column, so the derived TableDocModel is non-empty and identifiable.
  const usersSchema: DbmlSchema = {
    tables: [
      {
        id: 'public.users',
        name: 'users',
        schema: 'public',
        columns: [
          {
            id: 'public.users.id',
            name: 'id',
            type: 'integer',
            pk: true,
            notNull: true,
            unique: false,
            increment: false,
            isFk: false,
          },
          {
            id: 'public.users.email',
            name: 'email',
            type: 'varchar',
            pk: false,
            notNull: true,
            unique: true,
            increment: false,
            isFk: false,
          },
        ],
      },
    ],
    refs: [],
    enums: [],
    tableGroups: [],
    notes: [],
  }

  function mockLoadedProject() {
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        name: 'My Project',
        dbml_text:
          'Table users {\n  id integer [pk]\n  email varchar [unique, not null]\n}',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof project.useProject>)
  }

  // Open the radix dropdown despite JSDOM's missing layout/pointer support.
  const setup = () =>
    userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(autosave, 'useProjectAutosave').mockReturnValue({ status: 'idle' })
    // Make the parse SYNCHRONOUS + successful so `schema` is ready at first
    // render: the Export trigger is enabled (not gated by the 300ms debounce)
    // and the derived tableDoc is non-empty before any click.
    vi.spyOn(dbmlEditor, 'useDbmlParse').mockReturnValue({
      status: 'success',
      schema: usersSchema,
      lastValidSchema: usersSchema,
    })
    // Fire onCaptureReady immediately so the page mounts without a live canvas.
    vi.spyOn(canvas, 'ErdCanvas').mockImplementation(
      (props: { onCaptureReady?: (h: canvas.ErdCaptureHandle) => void }) => {
        props.onCaptureReady?.({
          fitView: () => {},
          getInstance: () => null as never,
        })
        return <div data-testid="erd-canvas-stub" />
      },
    )
  })

  it('renders an Export trigger with all six items', async () => {
    mockLoadedProject()
    const user = setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: /export/i }))
    expect(
      await screen.findByRole('menuitem', { name: 'Diagram PNG' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: 'Diagram SVG' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: 'Diagram PDF' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: 'Table Doc HTML' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: 'Table Doc Excel' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: 'Table Doc PDF' }),
    ).toBeInTheDocument()
  })

  it('Diagram PNG/SVG/PDF call the matching diagram exporter', async () => {
    mockLoadedProject()
    // Spy on the lib module that ExportMenu imports from (same namespace reference).
    const png = vi.spyOn(exportDiagramLib, 'exportDiagramPng').mockResolvedValue()
    const svg = vi.spyOn(exportDiagramLib, 'exportDiagramSvg').mockResolvedValue()
    const pdf = vi.spyOn(exportDiagramLib, 'exportDiagramPdf').mockResolvedValue()
    const user = setup()
    renderEditor()

    await user.click(screen.getByRole('button', { name: /export/i }))
    await user.click(await screen.findByRole('menuitem', { name: 'Diagram PNG' }))
    expect(png).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /export/i }))
    await user.click(await screen.findByRole('menuitem', { name: 'Diagram SVG' }))
    expect(svg).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /export/i }))
    await user.click(await screen.findByRole('menuitem', { name: 'Diagram PDF' }))
    expect(pdf).toHaveBeenCalledTimes(1)
  })

  it('Table Doc Excel/PDF build from the derived model and download', async () => {
    mockLoadedProject()
    const xlsx = vi
      .spyOn(exportTableDoc, 'buildTableDocXlsxBlob')
      .mockReturnValue(new Blob(['xlsx']))
    const pdf = vi
      .spyOn(exportTableDoc, 'buildTableDocPdfBlob')
      .mockReturnValue(new Blob(['pdf']))
    const dl = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {})
    const user = setup()
    renderEditor()

    await user.click(screen.getByRole('button', { name: /export/i }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'Table Doc Excel' }),
    )
    expect(xlsx).toHaveBeenCalledTimes(1)
    // useDbmlParse is mocked to a ready `users` schema, so the derived model
    // is non-empty at click time (no debounce race).
    const xlsxModel = xlsx.mock.calls[0][0]
    expect(xlsxModel.tables.map((t) => t.name)).toContain('users')
    expect(dl).toHaveBeenCalledWith(expect.any(Blob), 'table-definition.xlsx')

    await user.click(screen.getByRole('button', { name: /export/i }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'Table Doc PDF' }),
    )
    expect(pdf).toHaveBeenCalledTimes(1)
    expect(dl).toHaveBeenCalledWith(expect.any(Blob), 'table-definition.pdf')
  })

  it('Table Doc HTML opens the in-app table-doc view', async () => {
    mockLoadedProject()
    const user = setup()
    renderEditor()
    expect(screen.queryByTestId('table-doc-view')).toBeNull()
    await user.click(screen.getByRole('button', { name: /export/i }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'Table Doc HTML' }),
    )
    expect(screen.getByTestId('table-doc-view')).toBeInTheDocument()
  })

  it('disables the Export trigger when there is no parsed schema', () => {
    mockLoadedProject()
    // Override the ready-schema mock from beforeEach: nothing parsed yet, so
    // `schema` is undefined and the disabled gate (!schema || no tables) holds.
    vi.spyOn(dbmlEditor, 'useDbmlParse').mockReturnValue({ status: 'idle' })
    renderEditor()
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled()
    expect(screen.queryByRole('menuitem')).toBeNull()
  })
})

describe('EditorPage — SQL import/export wiring', () => {
  const usersSchema: DbmlSchema = {
    tables: [
      {
        id: 'public.users',
        name: 'users',
        schema: 'public',
        columns: [
          {
            id: 'public.users.id',
            name: 'id',
            type: 'integer',
            pk: true,
            notNull: true,
            unique: false,
            increment: false,
            isFk: false,
          },
        ],
      },
    ],
    refs: [],
    enums: [],
    tableGroups: [],
    notes: [],
  }

  function mockLoadedProject(dbml_text: string) {
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        name: 'My Project',
        dbml_text,
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof project.useProject>)
  }

  const setup = () =>
    userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(autosave, 'useProjectAutosave').mockReturnValue({ status: 'idle' })
    vi.spyOn(dbmlEditor, 'useDbmlParse').mockReturnValue({
      status: 'success',
      schema: usersSchema,
      lastValidSchema: usersSchema,
    })
    vi.spyOn(canvas, 'ErdCanvas').mockImplementation(
      (props: { onCaptureReady?: (h: canvas.ErdCaptureHandle) => void }) => {
        props.onCaptureReady?.({
          fitView: () => {},
          getInstance: () => null as never,
        })
        return <div data-testid="erd-canvas-stub" />
      },
    )
    // Stub the import dialog: render its trigger surface only when `open`,
    // and expose a button that drives onImport so we can assert the page
    // threads it into setDbmlText.
    vi.spyOn(sqlImport, 'SqlImportDialog').mockImplementation(
      (props: sqlImport.SqlImportDialogProps) =>
        props.open ? (
          <div data-testid="sql-import-dialog-stub">
            <span data-testid="has-existing">
              {String(props.hasExistingContent)}
            </span>
            <button
              onClick={() =>
                props.onImport('Table imported {\n  id int [pk]\n}')
              }
            >
              fire-import
            </button>
          </div>
        ) : <></>,
    )
  })

  it('opens the SqlImportDialog when the Import SQL button is clicked', async () => {
    mockLoadedProject('Table users {\n  id integer [pk]\n}')
    const user = setup()
    renderEditor()

    expect(screen.queryByTestId('sql-import-dialog-stub')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Import SQL' }))
    expect(screen.getByTestId('sql-import-dialog-stub')).toBeInTheDocument()
  })

  it('passes hasExistingContent=true when the editor holds non-empty DBML', async () => {
    mockLoadedProject('Table users {\n  id integer [pk]\n}')
    const user = setup()
    renderEditor()

    await user.click(screen.getByRole('button', { name: 'Import SQL' }))
    expect(screen.getByTestId('has-existing')).toHaveTextContent('true')
  })

  it('imports DBML into the editor (onImport -> setDbmlText)', async () => {
    mockLoadedProject('Table users {\n  id integer [pk]\n}')
    const user = setup()
    renderEditor()

    await user.click(screen.getByRole('button', { name: 'Import SQL' }))
    await user.click(screen.getByRole('button', { name: 'fire-import' }))

    // setDbmlText replaced the document: the CodeMirror editor now shows the
    // imported table name. Poll because @uiw/react-codemirror applies an
    // external `value` change via an async reconfigure/dispatch effect.
    await waitFor(() =>
      expect(screen.getByTestId('dbml-editor').textContent).toContain(
        'Table imported',
      ),
    )
  })

  it('exports SQL via downloadSql for the chosen dialect', async () => {
    mockLoadedProject('Table users {\n  id integer [pk]\n}')
    const dl = vi.spyOn(sqlExport, 'downloadSql').mockReturnValue(true)
    const user = setup()
    renderEditor()

    await user.click(screen.getByRole('button', { name: /export/i }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'SQL · PostgreSQL' }),
    )
    expect(dl).toHaveBeenCalledWith(
      'Table users {\n  id integer [pk]\n}',
      'postgres',
    )
  })

  it('SQL export passes the CURRENT (invalid) text while the trigger stays enabled via lastValidSchema', async () => {
    // The current text is invalid, but a prior valid parse is retained. pages
    // gates the Export trigger on `schema ?? lastValidSchema`, so the trigger
    // is ENABLED even though `exportDbmlToSql(currentText)` would fail. This
    // pins that the SQL export item passes the CURRENT dbmlText (not the last
    // valid one) — downloadSql then warns + returns false in real usage.
    const invalidText = 'Table users {\n  id integer [pk'
    mockLoadedProject(invalidText)
    vi.spyOn(dbmlEditor, 'useDbmlParse').mockReturnValue({
      status: 'error',
      schema: undefined,
      lastValidSchema: usersSchema,
      errors: [{ message: 'x' }],
    })
    const dl = vi.spyOn(sqlExport, 'downloadSql').mockReturnValue(false)
    const user = setup()
    renderEditor()

    await user.click(screen.getByRole('button', { name: /export/i }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'SQL · PostgreSQL' }),
    )
    expect(dl).toHaveBeenCalledWith(invalidText, 'postgres')
  })
})
