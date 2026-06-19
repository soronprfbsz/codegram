import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import * as reactRouter from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProjectRow } from './ProjectRow'
import * as projectEntity from '@/entities/project'
import * as sqlExport from '@/features/sql-export'
import * as exportTableDoc from '@/features/export-table-doc'
import * as download from '@/shared/lib/download'
import { useTableDocViewStore } from '@/widgets/table-doc-view'
import type { Project } from '@/entities/project'

const PROJECT: Project = {
  id: 'p-1',
  user_id: 'u-1',
  name: 'My Project',
  dbml_text: 'Table users {\n  id int [pk]\n}',
  layout: {},
  glyph: null,
  color: null,
  created_at: '2026-06-05T00:00:00Z',
  updated_at: '2026-06-05T00:00:00Z',
}

const setup = () =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

function renderRow(project = PROJECT, active = false, collapsed = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/', element: <ProjectRow project={project} active={active} collapsed={collapsed} /> }],
    { initialEntries: ['/'] },
  )
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

async function openMenu(user: ReturnType<typeof setup>) {
  await user.click(screen.getByRole('button', { name: `${PROJECT.name} 메뉴` }))
}

describe('ProjectRow context menu', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useTableDocViewStore.setState({ model: null })
    vi.spyOn(projectEntity, 'useUpdateProject').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    } as unknown as ReturnType<typeof projectEntity.useUpdateProject>)
    vi.spyOn(projectEntity, 'useDeleteProject').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    } as unknown as ReturnType<typeof projectEntity.useDeleteProject>)
  })

  it('renders the export + project ops items', async () => {
    const user = setup()
    renderRow()
    await openMenu(user)
    for (const name of [
      'Table Doc HTML',
      'Table Doc Excel',
      'Table Doc PDF',
      'SQL · PostgreSQL',
      '이름 변경',
      '삭제',
    ]) {
      expect(await screen.findByRole('menuitem', { name })).toBeInTheDocument()
    }
  })

  it('Table Doc HTML opens the global overlay with the derived model', async () => {
    const user = setup()
    renderRow()
    await openMenu(user)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Table Doc HTML' }))
    const model = useTableDocViewStore.getState().model
    expect(model).not.toBeNull()
    expect(model?.tables.map((t) => t.name)).toContain('users')
  })

  it('SQL · PostgreSQL downloads from the row project dbml_text', async () => {
    const dl = vi.spyOn(sqlExport, 'downloadSql').mockReturnValue(true)
    const user = setup()
    renderRow()
    await openMenu(user)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'SQL · PostgreSQL' }))
    expect(dl).toHaveBeenCalledWith(PROJECT.dbml_text, 'postgres')
  })

  it('Table Doc Excel builds from the derived model and downloads', async () => {
    const xlsx = vi
      .spyOn(exportTableDoc, 'buildTableDocXlsxBlob')
      .mockReturnValue(new Blob(['xlsx']))
    const dl = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {})
    const user = setup()
    renderRow()
    await openMenu(user)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Table Doc Excel' }))
    expect(xlsx).toHaveBeenCalledTimes(1)
    expect(dl).toHaveBeenCalledWith(expect.any(Blob), 'table-definition.xlsx')
  })

  it('disables export items when the project DBML has no tables', async () => {
    const user = setup()
    renderRow({ ...PROJECT, dbml_text: '' })
    await openMenu(user)
    const html = await screen.findByRole('menuitem', { name: 'Table Doc HTML' })
    expect(html).toHaveAttribute('aria-disabled', 'true')
  })

  it('Rename swaps to an inline input and commits via useUpdateProject', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(projectEntity, 'useUpdateProject').mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof projectEntity.useUpdateProject>)
    const user = setup()
    renderRow()
    await openMenu(user)
    fireEvent.click(await screen.findByRole('menuitem', { name: '이름 변경' }))

    const input = await screen.findByRole('textbox', { name: '프로젝트 이름' })
    await user.clear(input)
    await user.type(input, 'Renamed{Enter}')
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ name: 'Renamed' }))
  })

  it('Delete asks for confirmation, then deletes and navigates home when active', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(projectEntity, 'useDeleteProject').mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof projectEntity.useDeleteProject>)
    const navigate = vi.fn()
    vi.spyOn(reactRouter, 'useNavigate').mockReturnValue(navigate)

    const user = setup()
    renderRow(PROJECT, /* active */ true)
    await openMenu(user)
    fireEvent.click(await screen.findByRole('menuitem', { name: '삭제' }))

    // Confirmation dialog
    expect(await screen.findByText(/삭제할까요/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('p-1'))
    expect(navigate).toHaveBeenCalledWith('/')
  })
})
