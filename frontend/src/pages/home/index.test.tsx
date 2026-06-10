import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HomePage } from './index'
import * as session from '@/entities/session'
import * as project from '@/entities/project'

function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createMemoryRouter([{ path: '/', element: <HomePage /> }], {
    initialEntries: ['/'],
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(session, 'useCurrentUser').mockReturnValue({
      data: {
        id: 'u-1',
        email: 'me@example.com',
        is_active: true,
        is_superuser: false,
        is_verified: false,
      },
      isPending: false,
    } as ReturnType<typeof session.useCurrentUser>)

    vi.spyOn(project, 'useProjectList').mockReturnValue({
      data: [
        {
          id: 'p-1',
          user_id: 'u-1',
          name: 'My Project',
          dbml_text: '',
          layout: {},
          created_at: '2026-06-05T00:00:00Z',
          updated_at: '2026-06-05T00:00:00Z',
        },
      ],
      isLoading: false,
    } as ReturnType<typeof project.useProjectList>)

    vi.spyOn(project, 'useCreateProject').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof project.useCreateProject>)

    vi.spyOn(project, 'useDeleteProject').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof project.useDeleteProject>)
  })

  it('renders the app heading', () => {
    renderHome()
    expect(
      screen.getByRole('heading', { name: 'Codegram' }),
    ).toBeInTheDocument()
  })

  it('shows the current user email', () => {
    renderHome()
    expect(screen.getByText('me@example.com')).toBeInTheDocument()
  })

  it('renders a logout button', () => {
    renderHome()
    expect(
      screen.getByRole('button', { name: /log out/i }),
    ).toBeInTheDocument()
  })

  it('renders the project dashboard list', () => {
    renderHome()
    expect(screen.getByText('My Project')).toBeInTheDocument()
  })
})
