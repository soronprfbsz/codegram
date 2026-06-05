import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HomePage } from './index'
import * as session from '@/entities/session'

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
  })

  it('renders the app heading', () => {
    renderHome()
    expect(
      screen.getByRole('heading', { name: 'ERD-DBML' }),
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
})
