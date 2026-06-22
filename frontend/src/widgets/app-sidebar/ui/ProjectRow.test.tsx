import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import * as reactRouter from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProjectRow } from './ProjectRow'
import * as projectEntity from '@/entities/project'
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
    vi.spyOn(projectEntity, 'useUpdateProject').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    } as unknown as ReturnType<typeof projectEntity.useUpdateProject>)
    vi.spyOn(projectEntity, 'useDeleteProject').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    } as unknown as ReturnType<typeof projectEntity.useDeleteProject>)
  })

  it('renders only project ops — preview/export moved to the editor TopBar', async () => {
    const user = setup()
    renderRow()
    await openMenu(user)
    expect(await screen.findByRole('menuitem', { name: '이름 변경' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '삭제' })).toBeInTheDocument()
    // Preview + export no longer live in the sidebar row menu.
    expect(screen.queryByRole('menuitem', { name: '테이블 정의서 미리보기' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Export' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'SQL · PostgreSQL' })).toBeNull()
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
