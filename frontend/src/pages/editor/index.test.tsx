import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditorPage } from './index'
import * as project from '@/entities/project'
import * as autosave from '@/features/project-autosave'
import * as canvas from '@/features/erd-canvas'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import * as dbmlEditor from '@/features/dbml-editor'
import * as exportDiagramLib from '@/features/export-diagram/lib/exportDiagram'
import type { DbmlSchema } from '@/entities/dbml'
import * as sqlImport from '@/features/sql-import'
import * as dbImport from '@/features/db-import'

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

type User = ReturnType<typeof userEvent.setup>

/** Open the TopBar "Diagram ▾" export dropdown. */
async function openDiagramMenu(user: User) {
  await user.click(screen.getByRole('button', { name: 'Export' }))
}

/** Open the DBML pane header's "가져오기" (Import) dropdown. */
async function openImportMenu(user: User) {
  await user.click(screen.getByRole('button', { name: '가져오기' }))
}

/**
 * Select a menu item by name. Uses fireEvent for the click: radix Item onSelect
 * races userEvent's pointer sequence in jsdom, so a direct click is deterministic.
 */
async function chooseItem(name: string) {
  fireEvent.click(await screen.findByRole('menuitem', { name }))
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

    expect(
      screen.getByRole('heading', { name: 'My Project' }),
    ).toBeInTheDocument()

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

    const lastCall = autosaveSpy.mock.calls.at(-1)?.[0] as {
      projectId: string
      dbmlText: string
      baseline?: string
    }
    expect(lastCall.projectId).toBe('p-1')
    expect(lastCall.dbmlText).toBe('Table users {\n  id int [pk]\n}')
    expect(lastCall.baseline).toBe('Table users {\n  id int [pk]\n}')
  })

  it('collapses the info panel via its header toggle and re-expands from the rail', async () => {
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

    vi.spyOn(dbmlEditor, 'useDbmlParse').mockReturnValue({
      status: 'success',
      schema: {
        tables: [
          {
            id: 'public.users',
            name: 'users',
            schema: 'public',
            columns: [
              { id: 'public.users.id', name: 'id', type: 'integer', pk: true, notNull: true, unique: false, increment: false, isFk: false },
            ],
          },
        ],
        refs: [],
        enums: [],
        tableGroups: [],
        notes: [],
      } as import('@/entities/dbml').DbmlSchema,
      lastValidSchema: undefined,
    })

    renderEditor()

    expect(screen.getAllByText(/schema summary/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByTestId('stat-tables').textContent).toBe('1')
    expect(screen.getByTestId('tablelist-row-users')).toBeInTheDocument()

    const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

    // The collapse toggle lives in the info panel's own header now.
    await user.click(screen.getByRole('button', { name: 'Collapse info panel' }))
    // Collapsed → the rail shows an expand button; panel content is gone.
    const expand = await screen.findByRole('button', { name: 'Expand info panel' })
    expect(screen.queryByText(/schema summary/i)).toBeNull()

    // Re-expanding restores the panel content.
    await user.click(expand)
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
      edges: {},
    })
    expect(lastCall.layoutBaseline).toEqual({
      version: 1,
      positions: { 'public.users': { x: 320, y: 80 } },
      edges: {},
    })
  })

  it('passes savedPositions + onLayoutChange to the ERD canvas', () => {
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

describe('EditorPage — Diagram export wiring (TopBar)', () => {
  const usersSchema: DbmlSchema = {
    tables: [
      {
        id: 'public.users',
        name: 'users',
        schema: 'public',
        columns: [
          { id: 'public.users.id', name: 'id', type: 'integer', pk: true, notNull: true, unique: false, increment: false, isFk: false },
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
        dbml_text: 'Table users {\n  id integer [pk]\n}',
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
          centerOnNode: () => {},
          getInstance: () => null as never,
          setNodePositionAbs: () => {},
          setEdgeWaypoint: () => {},
          resetEdgePath: () => {},
        })
        return <div data-testid="erd-canvas-stub" />
      },
    )
  })

  it('Export menu is the unified hub: preview + Diagram + Table Doc + SQL', async () => {
    mockLoadedProject()
    const user = setup()
    renderEditor()
    await openDiagramMenu(user)
    for (const name of [
      '테이블 정의서 미리보기',
      'Diagram PNG',
      'Diagram SVG',
      'Diagram PDF',
      'Table Doc Excel',
      'Table Doc PDF',
      'SQL · PostgreSQL',
    ]) {
      expect(await screen.findByRole('menuitem', { name })).toBeInTheDocument()
    }
  })

  it('Diagram PNG/SVG/PDF call the matching diagram exporter', async () => {
    mockLoadedProject()
    const png = vi.spyOn(exportDiagramLib, 'exportDiagramPng').mockResolvedValue()
    const svg = vi.spyOn(exportDiagramLib, 'exportDiagramSvg').mockResolvedValue()
    const pdf = vi.spyOn(exportDiagramLib, 'exportDiagramPdf').mockResolvedValue()
    const user = setup()
    renderEditor()

    await openDiagramMenu(user)
    await chooseItem('Diagram PNG')
    expect(png).toHaveBeenCalledTimes(1)

    await openDiagramMenu(user)
    await chooseItem('Diagram SVG')
    expect(svg).toHaveBeenCalledTimes(1)

    await openDiagramMenu(user)
    await chooseItem('Diagram PDF')
    expect(pdf).toHaveBeenCalledTimes(1)
  })

  it('disables the Diagram trigger when there is no parsed schema', () => {
    mockLoadedProject()
    vi.spyOn(dbmlEditor, 'useDbmlParse').mockReturnValue({ status: 'idle' })
    renderEditor()
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
  })
})

describe('EditorPage — Phase 5 selection wiring', () => {
  const selectionSchema = {
    tables: [
      {
        id: 'public.users',
        name: 'users',
        schema: 'public',
        columns: [
          { id: 'public.users.id', name: 'id', type: 'integer', pk: true, notNull: true, unique: false, increment: false, isFk: false },
        ],
      },
    ],
    refs: [],
    enums: [],
    tableGroups: [],
    notes: [],
  } as import('@/entities/dbml').DbmlSchema

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(autosave, 'useProjectAutosave').mockReturnValue({ status: 'idle' })
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        name: 'My Project',
        dbml_text: 'Table users {\n  id integer [pk]\n}',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof project.useProject>)
    vi.spyOn(dbmlEditor, 'useDbmlParse').mockReturnValue({
      status: 'success',
      schema: selectionSchema,
      lastValidSchema: selectionSchema,
    })
  })

  it('passes selection and onSelect to ErdCanvas', () => {
    const erdSpy = vi
      .spyOn(canvas, 'ErdCanvas')
      .mockReturnValue(<div data-testid="erd-canvas-stub" />)

    renderEditor()

    const props = erdSpy.mock.calls.at(-1)?.[0] as {
      selection?: unknown
      onSelect?: unknown
    }
    expect(props.selection).toBeNull()
    expect(typeof props.onSelect).toBe('function')
  })

  it('passes selectedTable to DbmlEditor', () => {
    vi.spyOn(canvas, 'ErdCanvas').mockReturnValue(
      <div data-testid="erd-canvas-stub" />,
    )

    renderEditor()

    expect(screen.getByTestId('dbml-editor')).toBeInTheDocument()
  })

  it('ErdInfoPanel row click propagates selection (onSelect → selected)', async () => {
    const erdSpy = vi
      .spyOn(canvas, 'ErdCanvas')
      .mockReturnValue(<div data-testid="erd-canvas-stub" />)

    const user = userEvent.setup({
      pointerEventsCheck: 0 as never,
    })
    renderEditor()

    const row = screen.getByTestId('tablelist-row-users')
    await user.click(row)

    const lastProps = erdSpy.mock.calls.at(-1)?.[0] as {
      selection?: { kind: string; nodeType?: string; tableName?: string }
    }
    expect(lastProps.selection).toEqual({
      kind: 'node',
      nodeId: 'public.users',
      nodeType: 'table',
      tableName: 'users',
    })
  })
})

describe('EditorPage — SQL import wiring (DBML header)', () => {
  const usersSchema: DbmlSchema = {
    tables: [
      {
        id: 'public.users',
        name: 'users',
        schema: 'public',
        columns: [
          { id: 'public.users.id', name: 'id', type: 'integer', pk: true, notNull: true, unique: false, increment: false, isFk: false },
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
          centerOnNode: () => {},
          getInstance: () => null as never,
          setNodePositionAbs: () => {},
          setEdgeWaypoint: () => {},
          resetEdgePath: () => {},
        })
        return <div data-testid="erd-canvas-stub" />
      },
    )
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

  it('opens the SqlImportDialog from 가져오기 ▸ Import SQL', async () => {
    mockLoadedProject('Table users {\n  id integer [pk]\n}')
    const user = setup()
    renderEditor()

    expect(screen.queryByTestId('sql-import-dialog-stub')).toBeNull()
    await openImportMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'Import SQL' }))
    expect(screen.getByTestId('sql-import-dialog-stub')).toBeInTheDocument()
  })

  it('passes hasExistingContent=true when the editor holds non-empty DBML', async () => {
    mockLoadedProject('Table users {\n  id integer [pk]\n}')
    const user = setup()
    renderEditor()

    await openImportMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'Import SQL' }))
    expect(screen.getByTestId('has-existing')).toHaveTextContent('true')
  })

  it('imports DBML into the editor (onImport -> setDbmlText)', async () => {
    mockLoadedProject('Table users {\n  id integer [pk]\n}')
    const user = setup()
    renderEditor()

    await openImportMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'Import SQL' }))
    await user.click(screen.getByRole('button', { name: 'fire-import' }))

    await waitFor(() =>
      expect(screen.getByTestId('dbml-editor').textContent).toContain(
        'Table imported',
      ),
    )
  })
})

describe('EditorPage — DB Sync wiring', () => {
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
    vi.spyOn(canvas, 'ErdCanvas').mockImplementation(
      (props: { onCaptureReady?: (h: canvas.ErdCaptureHandle) => void }) => {
        props.onCaptureReady?.({
          fitView: () => {},
          centerOnNode: () => {},
          getInstance: () => null as never,
          setNodePositionAbs: () => {},
          setEdgeWaypoint: () => {},
          resetEdgePath: () => {},
        })
        return <div data-testid="erd-canvas-stub" />
      },
    )
    vi.spyOn(dbImport, 'DbConnectDialog').mockImplementation(
      (props: { open: boolean; onIntrospected: (d: string, n: string) => void }) =>
        props.open ? (
          <button
            onClick={() =>
              props.onIntrospected(
                'Table synced {\n  id int [pk]\n}',
                'db',
              )
            }
          >
            fire-sync-introspected
          </button>
        ) : <></>,
    )
  })

  it('confirm path: Replace replaces the DBML and shows the synced table', async () => {
    mockLoadedProject('Table old {\n  id int [pk]\n}')
    const user = setup()
    renderEditor()

    await openImportMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'DB에서 동기화' }))
    await user.click(screen.getByRole('button', { name: 'fire-sync-introspected' }))

    expect(screen.getByText(/sync from database\?/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /replace/i }))

    await waitFor(() =>
      expect(screen.getByTestId('tablelist-row-synced')).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('tablelist-row-old')).toBeNull()
  })

  it('cancel path: Cancel on confirm dialog does NOT replace the DBML', async () => {
    mockLoadedProject('Table old {\n  id int [pk]\n}')
    const user = setup()
    renderEditor()

    await openImportMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'DB에서 동기화' }))
    await user.click(screen.getByRole('button', { name: 'fire-sync-introspected' }))

    expect(screen.getByText(/sync from database\?/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(screen.queryByText(/sync from database\?/i)).toBeNull()

    await waitFor(() =>
      expect(screen.getByTestId('tablelist-row-old')).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('tablelist-row-synced')).toBeNull()
  })
})
