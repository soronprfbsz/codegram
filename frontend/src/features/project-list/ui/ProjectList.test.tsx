import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProjectList } from './ProjectList'
import * as entities from '@/entities/project'

const createMutateAsync = vi.fn()
const deleteMutateAsync = vi.fn()
const updateMutateAsync = vi.fn()
// Records the id useUpdateProject was constructed with on the most recent call
// for the row whose rename was triggered.
const updateProjectIds: string[] = []

function mockEntities(projects: entities.Project[]) {
  vi.spyOn(entities, 'useProjectList').mockReturnValue({
    data: projects,
    isLoading: false,
  } as ReturnType<typeof entities.useProjectList>)

  vi.spyOn(entities, 'useCreateProject').mockReturnValue({
    mutateAsync: createMutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof entities.useCreateProject>)

  vi.spyOn(entities, 'useDeleteProject').mockReturnValue({
    mutateAsync: deleteMutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof entities.useDeleteProject>)

  vi.spyOn(entities, 'useUpdateProject').mockImplementation((id: string) => {
    updateProjectIds.push(id)
    return {
      mutateAsync: updateMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof entities.useUpdateProject>
  })
}

function renderList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createMemoryRouter(
    [{ path: '/', element: <ProjectList /> }],
    { initialEntries: ['/'] },
  )
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const sampleProject: entities.Project = {
  id: 'p-1',
  user_id: 'u-1',
  name: 'My Project',
  dbml_text: '',
  layout: {},
  created_at: '2026-06-05T00:00:00Z',
  updated_at: '2026-06-05T00:00:00Z',
}

describe('ProjectList', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    createMutateAsync.mockReset()
    deleteMutateAsync.mockReset()
    updateMutateAsync.mockReset()
    updateProjectIds.length = 0
    createMutateAsync.mockResolvedValue({ ...sampleProject, id: 'p-new' })
    deleteMutateAsync.mockResolvedValue(undefined)
    updateMutateAsync.mockResolvedValue({ ...sampleProject, name: 'Renamed' })
  })

  it('renders the names of existing projects', () => {
    mockEntities([sampleProject])
    renderList()
    expect(screen.getByText('My Project')).toBeInTheDocument()
  })

  it('shows an empty-state message when there are no projects', () => {
    mockEntities([])
    renderList()
    expect(screen.getByText(/no projects yet/i)).toBeInTheDocument()
  })

  it('creates a project from the form input', async () => {
    mockEntities([])
    renderList()
    const user = userEvent.setup()

    await user.type(
      screen.getByPlaceholderText('Project name'),
      'Fresh',
    )
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(createMutateAsync).toHaveBeenCalledWith({ name: 'Fresh' })
  })

  it('deletes a project when its delete button is clicked', async () => {
    mockEntities([sampleProject])
    renderList()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /delete/i }))

    expect(deleteMutateAsync).toHaveBeenCalledWith('p-1')
  })

  it('renames a project via the inline rename control', async () => {
    mockEntities([sampleProject])
    renderList()
    const user = userEvent.setup()

    // Open the inline rename editor for the row.
    await user.click(screen.getByRole('button', { name: /rename/i }))

    const input = screen.getByDisplayValue('My Project')
    await user.clear(input)
    await user.type(input, 'Renamed')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(updateMutateAsync).toHaveBeenCalledWith({ name: 'Renamed' })
    // The update mutation was constructed for the correct project id.
    expect(updateProjectIds).toContain('p-1')
  })
})
