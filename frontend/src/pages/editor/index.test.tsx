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
import * as editLockApi from '@/features/edit-lock/api/editLock'
import { ToastProvider } from '@/shared/ui/toast'
import { ApiError } from '@/shared/api/client'
import * as snapshotHistory from '@/widgets/snapshot-history'
import * as snapshotEntity from '@/entities/snapshot'

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
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

type User = ReturnType<typeof userEvent.setup>

/** Info-panel group sections are collapsed by default — expand them to see rows. */
function expandAllGroups() {
  screen.queryAllByLabelText('그룹 펼치기').forEach((b) => fireEvent.click(b))
}

/** Open the TopBar "Diagram ▾" export dropdown. */
async function openDiagramMenu(user: User) {
  await user.click(screen.getByRole('button', { name: '내보내기' }))
}

/**
 * Step into edit mode (ADR-0025). The editor opens read-only, so anything that
 * writes — SQL import, DB sync, group ops — is hidden until the user says they
 * are editing. Stubs the acquire so no network is needed.
 */
async function enterEditMode(user: User) {
  vi.spyOn(editLockApi, 'acquireLock').mockResolvedValue({
    locked: true,
    locked_by: 'u-1',
    locked_by_email: 'me@example.com',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    is_me: true,
  })
  await user.click(await screen.findByTestId('mode-switch-edit'))
  await waitFor(() =>
    expect(screen.getByTestId('mode-switch-edit')).toHaveAttribute('aria-checked', 'true'),
  )
}

/** Open the topbar's "Import" dropdown. */
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
      .mockReturnValue({ status: 'idle', flush: () => Promise.resolve() })
  })

  it('shows the project name and seeds the editor with dbml_text', () => {
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        role: 'owner',
        name: 'My Project',
        dbml_text: 'Table users {\n  id int [pk]\n}',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
      // Entering edit mode resyncs through refetch (ADR-0025). These fixtures
      // are already the current state, so hand back nothing and keep the seed.
      refetch: vi.fn().mockResolvedValue({ data: undefined }),
    } as unknown as ReturnType<typeof project.useProject>)

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
        role: 'owner',
        name: 'My Project',
        dbml_text: 'Table users {\n  id int [pk]\n}',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
      // Entering edit mode resyncs through refetch (ADR-0025). These fixtures
      // are already the current state, so hand back nothing and keep the seed.
      refetch: vi.fn().mockResolvedValue({ data: undefined }),
    } as unknown as ReturnType<typeof project.useProject>)

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

  it('toggles the info panel from the topbar 정보 button (hidden by default)', async () => {
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        role: 'owner',
        name: 'My Project',
        dbml_text: 'Table users {\n  id int [pk]\n}',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
      // Entering edit mode resyncs through refetch (ADR-0025). These fixtures
      // are already the current state, so hand back nothing and keep the seed.
      refetch: vi.fn().mockResolvedValue({ data: undefined }),
    } as unknown as ReturnType<typeof project.useProject>)

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
            checks: [],
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

    // 기본 hidden — 우측 정보 패널 콘텐츠는 마운트되지 않는다.
    expect(screen.queryByText(/스키마 요약/)).toBeNull()
    expect(screen.queryByTestId('tablelist-row-users')).toBeNull()

    const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

    // 탑바 정보 버튼 → 패널 표시.
    await user.click(screen.getByTestId('info-panel-button'))
    expect(screen.getAllByText(/스키마 요약/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByTestId('stat-tables').textContent).toBe('1')
    expandAllGroups()
    expect(screen.getByTestId('tablelist-row-users')).toBeInTheDocument()

    // 패널 내부 닫기 버튼 → 영역 자체가 사라진다(레일 아님).
    await user.click(screen.getByRole('button', { name: '정보 패널 닫기' }))
    expect(screen.queryByText(/스키마 요약/)).toBeNull()
    expect(screen.queryByTestId('info-panel-column')).toBeNull()

    // 정보 버튼 재클릭 → 패널 복귀.
    await user.click(screen.getByTestId('info-panel-button'))
    expect(screen.getAllByText(/스키마 요약/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows parse errors with line/column + message when DBML is invalid', () => {
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        role: 'owner',
        name: 'My Project',
        dbml_text: 'Table T {\n  Checks {\n    x\n  }\n}',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
      // Entering edit mode resyncs through refetch (ADR-0025). These fixtures
      // are already the current state, so hand back nothing and keep the seed.
      refetch: vi.fn().mockResolvedValue({ data: undefined }),
    } as unknown as ReturnType<typeof project.useProject>)

    vi.spyOn(dbmlEditor, 'useDbmlParse').mockReturnValue({
      status: 'error',
      errors: [
        { message: 'A check field must be a function expression', line: 4, column: 5 },
      ],
      lastValidSchema: undefined,
    })

    renderEditor()

    const strip = screen.getByTestId('dbml-parse-errors')
    expect(strip).toHaveTextContent('line 4:5')
    expect(strip).toHaveTextContent('A check field must be a function expression')
  })

  it('mounts the ERD canvas region in the 3-zone layout', () => {
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        role: 'owner',
        name: 'My Project',
        dbml_text: 'Table users {\n  id int [pk]\n}',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
      // Entering edit mode resyncs through refetch (ADR-0025). These fixtures
      // are already the current state, so hand back nothing and keep the seed.
      refetch: vi.fn().mockResolvedValue({ data: undefined }),
    } as unknown as ReturnType<typeof project.useProject>)

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
    expect(screen.getByText(/프로젝트를 찾을 수 없습니다/)).toBeInTheDocument()
  })

  it('seeds layout from project.layout.positions into the autosave layout', () => {
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        role: 'owner',
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
      // Entering edit mode resyncs through refetch (ADR-0025). These fixtures
      // are already the current state, so hand back nothing and keep the seed.
      refetch: vi.fn().mockResolvedValue({ data: undefined }),
    } as unknown as ReturnType<typeof project.useProject>)

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
        role: 'owner',
        name: 'My Project',
        dbml_text: 'Table users {\n  id int [pk]\n}',
        layout: { version: 1, positions: { 'public.users': { x: 1, y: 2 } } } as Record<string, unknown>,
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
      // Entering edit mode resyncs through refetch (ADR-0025). These fixtures
      // are already the current state, so hand back nothing and keep the seed.
      refetch: vi.fn().mockResolvedValue({ data: undefined }),
    } as unknown as ReturnType<typeof project.useProject>)

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
        checks: [],
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
        role: 'owner',
        name: 'My Project',
        dbml_text: 'Table users {\n  id integer [pk]\n}',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
      // Entering edit mode resyncs through refetch (ADR-0025). These fixtures
      // are already the current state, so hand back nothing and keep the seed.
      refetch: vi.fn().mockResolvedValue({ data: undefined }),
    } as unknown as ReturnType<typeof project.useProject>)
  }

  const setup = () =>
    userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(autosave, 'useProjectAutosave').mockReturnValue({ status: 'idle', flush: () => Promise.resolve() })
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
      '다이어그램 PNG',
      '다이어그램 SVG',
      '다이어그램 PDF',
      '테이블 정의서 Excel',
      '테이블 정의서 PDF',
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
    await chooseItem('다이어그램 PNG')
    expect(png).toHaveBeenCalledTimes(1)

    await openDiagramMenu(user)
    await chooseItem('다이어그램 SVG')
    expect(svg).toHaveBeenCalledTimes(1)

    await openDiagramMenu(user)
    await chooseItem('다이어그램 PDF')
    expect(pdf).toHaveBeenCalledTimes(1)
  })

  it('disables the Diagram trigger when there is no parsed schema', () => {
    mockLoadedProject()
    vi.spyOn(dbmlEditor, 'useDbmlParse').mockReturnValue({ status: 'idle' })
    renderEditor()
    expect(screen.getByRole('button', { name: '내보내기' })).toBeDisabled()
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
        checks: [],
      },
    ],
    refs: [],
    enums: [],
    tableGroups: [],
    notes: [],
  } as import('@/entities/dbml').DbmlSchema

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(autosave, 'useProjectAutosave').mockReturnValue({ status: 'idle', flush: () => Promise.resolve() })
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        role: 'owner',
        name: 'My Project',
        dbml_text: 'Table users {\n  id integer [pk]\n}',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
      // Entering edit mode resyncs through refetch (ADR-0025). These fixtures
      // are already the current state, so hand back nothing and keep the seed.
      refetch: vi.fn().mockResolvedValue({ data: undefined }),
    } as unknown as ReturnType<typeof project.useProject>)
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

    // 정보 패널은 기본 hidden — 탑바 정보 버튼으로 열어 리스트를 노출한다.
    await user.click(screen.getByTestId('info-panel-button'))
    expandAllGroups()
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

describe('EditorPage — 읽기 모드에서는 캔버스도 편집되지 않는다 (ADR-0025)', () => {
  const usersSelectionInfo = {
    kind: 'node',
    nodeId: 'public.users',
    nodeType: 'table',
    label: 'users',
    x: 320,
    y: 80,
  } as import('@/entities/erd').SelectionInfo

  const usersSchema = {
    tables: [
      {
        id: 'public.users',
        name: 'users',
        schema: 'public',
        columns: [
          { id: 'public.users.id', name: 'id', type: 'integer', pk: true, notNull: true, unique: false, increment: false, isFk: false },
        ],
        checks: [],
      },
    ],
    refs: [],
    enums: [],
    tableGroups: [],
    notes: [],
  } as import('@/entities/dbml').DbmlSchema

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(autosave, 'useProjectAutosave').mockReturnValue({ status: 'idle', flush: () => Promise.resolve() })
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        role: 'owner',
        name: 'My Project',
        dbml_text: 'Table users {\n  id integer [pk]\n}',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn().mockResolvedValue({ data: undefined }),
    } as unknown as ReturnType<typeof project.useProject>)
    vi.spyOn(dbmlEditor, 'useDbmlParse').mockReturnValue({
      status: 'success',
      schema: usersSchema,
      lastValidSchema: usersSchema,
    })
    // 캔버스 스텁이 선택 정보를 올려 Selection 카드를 띄운다. 객체는 모듈 상수 —
    // 렌더마다 새 객체를 올리면 페이지 setState → 재렌더 → 다시 올림으로 무한
    // 루프가 된다(실제 ErdCanvas는 값 비교로 막는다).
    vi.spyOn(canvas, 'ErdCanvas').mockImplementation(
      (props: { onSelectionInfo?: (i: import('@/entities/erd').SelectionInfo | null) => void }) => {
        props.onSelectionInfo?.(usersSelectionInfo)
        return <div data-testid="erd-canvas-stub" />
      },
    )
  })

  it('읽기 모드에서는 캔버스가 readOnly로, Selection 카드 좌표는 편집 불가로 내려간다', async () => {
    const erdSpy = vi.spyOn(canvas, 'ErdCanvas')
    renderEditor()

    const props = erdSpy.mock.calls.at(-1)?.[0] as { readOnly?: boolean }
    expect(props.readOnly).toBe(true)
    // 좌표는 보이지만(읽기·복사) 값을 바꿔 커밋할 수는 없다.
    const x = await screen.findByTestId('sel-x')
    expect(x).toHaveAttribute('readonly')
  })

  it('편집 모드로 들어가면 같은 카드가 편집 가능해진다', async () => {
    const user = userEvent.setup({
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    })
    const erdSpy = vi.spyOn(canvas, 'ErdCanvas')
    renderEditor()
    await enterEditMode(user)

    await waitFor(() => {
      const props = erdSpy.mock.calls.at(-1)?.[0] as { readOnly?: boolean }
      expect(props.readOnly).toBe(false)
    })
    expect(screen.getByTestId('sel-x')).not.toHaveAttribute('readonly')
  })
})

describe('EditorPage — SQL import wiring (topbar)', () => {
  const usersSchema: DbmlSchema = {
    tables: [
      {
        id: 'public.users',
        name: 'users',
        schema: 'public',
        columns: [
          { id: 'public.users.id', name: 'id', type: 'integer', pk: true, notNull: true, unique: false, increment: false, isFk: false },
        ],
        checks: [],
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
        role: 'owner',
        name: 'My Project',
        dbml_text,
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
      // Entering edit mode resyncs through refetch (ADR-0025). These fixtures
      // are already the current state, so hand back nothing and keep the seed.
      refetch: vi.fn().mockResolvedValue({ data: undefined }),
    } as unknown as ReturnType<typeof project.useProject>)
  }

  const setup = () =>
    userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(autosave, 'useProjectAutosave').mockReturnValue({ status: 'idle', flush: () => Promise.resolve() })
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

  it('opens the SqlImportDialog from Import ▸ Import SQL', async () => {
    mockLoadedProject('Table users {\n  id integer [pk]\n}')
    const user = setup()
    renderEditor()

    expect(screen.queryByTestId('sql-import-dialog-stub')).toBeNull()
    await enterEditMode(user)
    await openImportMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'SQL 가져오기' }))
    expect(screen.getByTestId('sql-import-dialog-stub')).toBeInTheDocument()
  })

  it('passes hasExistingContent=true when the editor holds non-empty DBML', async () => {
    mockLoadedProject('Table users {\n  id integer [pk]\n}')
    const user = setup()
    renderEditor()

    await enterEditMode(user)
    await openImportMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'SQL 가져오기' }))
    expect(screen.getByTestId('has-existing')).toHaveTextContent('true')
  })

  it('imports DBML into the editor (onImport -> setDbmlText)', async () => {
    mockLoadedProject('Table users {\n  id integer [pk]\n}')
    const user = setup()
    renderEditor()

    await enterEditMode(user)
    await openImportMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'SQL 가져오기' }))
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
        role: 'owner',
        name: 'My Project',
        dbml_text,
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
      // Entering edit mode resyncs through refetch (ADR-0025). These fixtures
      // are already the current state, so hand back nothing and keep the seed.
      refetch: vi.fn().mockResolvedValue({ data: undefined }),
    } as unknown as ReturnType<typeof project.useProject>)
  }

  const setup = () =>
    userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(autosave, 'useProjectAutosave').mockReturnValue({ status: 'idle', flush: () => Promise.resolve() })
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
      (props: { open: boolean; onIntrospected: (d: string, n: string, s: string[]) => void }) =>
        props.open ? (
          <button
            onClick={() =>
              props.onIntrospected(
                'Table synced {\n  id int [pk]\n}',
                'db',
                ['public'],
              )
            }
          >
            fire-sync-introspected
          </button>
        ) : <></>,
    )
  })

  it('confirm path: Sync merges the DBML and shows the synced table', async () => {
    mockLoadedProject('Table old {\n  id int [pk]\n}')
    const user = setup()
    renderEditor()

    // tablelist를 검증하려면 정보 패널을 연다(기본 hidden).
    await user.click(screen.getByTestId('info-panel-button'))

    await enterEditMode(user)
    await openImportMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'DB에서 동기화' }))
    await user.click(screen.getByRole('button', { name: 'fire-sync-introspected' }))

    expect(screen.getByText(/데이터베이스에서 동기화할까요/)).toBeInTheDocument()

    // Confirm button name carries the removal count when a synced-schema table
    // is dropped, so match the trailing "동기화" rather than the exact string.
    await user.click(screen.getByRole('button', { name: /동기화$/ }))

    await waitFor(() => {
      expandAllGroups() // groups collapse by default; reveal rows once parsed
      expect(screen.getByTestId('tablelist-row-synced')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('tablelist-row-old')).toBeNull()
  })

  it('confirm path: non-synced schema tables are preserved after sync', async () => {
    // initial project has a `private` schema table — not in syncedSchemas (['public'])
    mockLoadedProject(
      'Table "private"."kept" {\n  id int [pk]\n}\nTable "public"."old" {\n  id int [pk]\n}',
    )
    const user = setup()
    renderEditor()

    await user.click(screen.getByTestId('info-panel-button'))

    await enterEditMode(user)
    await openImportMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'DB에서 동기화' }))
    await user.click(screen.getByRole('button', { name: 'fire-sync-introspected' }))

    // Preview surfaces the actual effect: public.old is removed (synced schema,
    // absent from the live DB) and the non-synced 'private' schema is kept.
    expect(screen.getByTestId('sync-removals')).toHaveTextContent('public.old')
    expect(screen.getByTestId('sync-preview')).toHaveTextContent('private')

    await user.click(screen.getByRole('button', { name: /동기화$/ }))

    await waitFor(() => {
      expandAllGroups()
      expect(screen.getByTestId('tablelist-row-synced')).toBeInTheDocument()
    })
    // private.kept survives because 'private' was not in syncedSchemas
    expect(screen.getByTestId('tablelist-row-kept')).toBeInTheDocument()
    // public.old is removed (synced schema, not in incoming)
    expect(screen.queryByTestId('tablelist-row-old')).toBeNull()
  })

  it('cancel path: Cancel on confirm dialog does NOT change the DBML', async () => {
    mockLoadedProject('Table old {\n  id int [pk]\n}')
    const user = setup()
    renderEditor()

    // tablelist를 검증하려면 정보 패널을 연다(기본 hidden).
    await user.click(screen.getByTestId('info-panel-button'))

    await enterEditMode(user)
    await openImportMenu(user)
    await user.click(await screen.findByRole('menuitem', { name: 'DB에서 동기화' }))
    await user.click(screen.getByRole('button', { name: 'fire-sync-introspected' }))

    expect(screen.getByText(/데이터베이스에서 동기화할까요/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^취소$/ }))

    expect(screen.queryByText(/데이터베이스에서 동기화할까요/)).toBeNull()

    await waitFor(() => {
      expandAllGroups() // groups collapse by default; reveal rows once parsed
      expect(screen.getByTestId('tablelist-row-old')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('tablelist-row-synced')).toBeNull()
  })
})

describe('EditorPage — 편집 종료 flush 실패', () => {
  function mockLoadedProject() {
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        role: 'owner',
        name: 'My Project',
        dbml_text: 'Table users {\n  id int [pk]\n}',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn().mockResolvedValue({ data: undefined }),
    } as unknown as ReturnType<typeof project.useProject>)
  }

  const setup = () =>
    userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

  /** Mount with a flush that always fails the way `error` says. */
  function renderWithFailingFlush(error: unknown) {
    vi.spyOn(autosave, 'useProjectAutosave').mockReturnValue({
      status: 'error',
      flush: () => Promise.reject(error),
    })
    mockLoadedProject()
    const release = vi.spyOn(editLockApi, 'releaseLock').mockResolvedValue(undefined)
    renderEditor()
    return release
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(canvas, 'ErdCanvas').mockImplementation(() => <div data-testid="erd-canvas-stub" />)
  })

  it('says so with a toast and keeps the user in edit mode, lease unreleased', async () => {
    // ADR-0027: 저장하지 못했으면 나가지 않는다. 그리고 실패는 알린다 —
    // 아무 말도 하지 않으면 "읽기를 눌렀는데 아무 일도 없다"로 보인다.
    const release = renderWithFailingFlush(new Error('network down'))
    const user = setup()

    await enterEditMode(user)
    await user.click(screen.getByTestId('mode-switch-read'))

    expect(await screen.findByTestId('toast')).toHaveTextContent('저장하지 못했습니다')
    expect(screen.getByTestId('mode-switch-edit')).toHaveAttribute('aria-checked', 'true')
    expect(release).not.toHaveBeenCalled()
  })

  it('does NOT toast on a 409 — the conflict dialog already says it', async () => {
    const release = renderWithFailingFlush(new ApiError('conflict', 409, 'edit_locked'))
    const user = setup()

    await enterEditMode(user)
    await user.click(screen.getByTestId('mode-switch-read'))

    await waitFor(() =>
      expect(screen.getByTestId('mode-switch-edit')).toHaveAttribute('aria-checked', 'true'),
    )
    expect(screen.queryByTestId('toast')).toBeNull()
    expect(release).not.toHaveBeenCalled()
  })
})

describe('EditorPage — 스냅샷 미리보기 중 저장 버튼', () => {
  const setup = () =>
    userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(autosave, 'useProjectAutosave').mockReturnValue({
      status: 'idle',
      flush: () => Promise.resolve(),
    })
    vi.spyOn(canvas, 'ErdCanvas').mockImplementation(() => <div data-testid="erd-canvas-stub" />)
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        role: 'owner',
        name: 'My Project',
        dbml_text: 'Table users {\n  id int [pk]\n}',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn().mockResolvedValue({ data: undefined }),
    } as unknown as ReturnType<typeof project.useProject>)
    // The panel's own fetching is not what this test is about — stub it down to
    // the one thing the page reacts to: "preview this snapshot".
    vi.spyOn(snapshotHistory, 'SnapshotHistoryPanel').mockImplementation(
      (props: { onPreview: (id: string) => void }) => (
        <button onClick={() => props.onPreview('s-1')}>fire-preview</button>
      ),
    )
    vi.spyOn(snapshotEntity, 'useSnapshot').mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof snapshotEntity.useSnapshot>)
  })

  it('hides the Save button while previewing (saving is impossible there)', async () => {
    // useManualSave gets `editable: !readOnly && !previewing` — a visible button
    // would answer "편집 모드에서만 저장할 수 있습니다" to someone who IS in edit mode.
    const user = setup()
    renderEditor()

    await enterEditMode(user)
    expect(screen.getByTestId('manual-save-button')).toBeInTheDocument()

    await user.click(screen.getByTestId('snapshot-history-button'))
    await user.click(await screen.findByRole('button', { name: 'fire-preview' }))

    expect(screen.queryByTestId('manual-save-button')).toBeNull()
  })
})
