import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditorPage } from './index'
import * as project from '@/entities/project'
import * as autosave from '@/features/project-autosave'

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

  it('renders the parse status and schema summary panels', () => {
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

    expect(screen.getByText(/parse status/i)).toBeInTheDocument()
    expect(screen.getByText(/schema summary/i)).toBeInTheDocument()
  })

  it('mounts the ERD canvas region in the editor split view', () => {
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
    // shows the empty-state placeholder. Either testid proves the split view
    // includes the ERD canvas region.
    const canvas =
      screen.queryByTestId('erd-canvas') ??
      screen.queryByTestId('erd-canvas-empty')
    expect(canvas).toBeInTheDocument()
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
})
