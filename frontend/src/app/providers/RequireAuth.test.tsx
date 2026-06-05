import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RequireAuth, RequireGuest } from './RequireAuth'
import * as session from '@/entities/session'

function renderAt(
  initialPath: string,
  element: React.ReactElement,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createMemoryRouter(
    [
      { path: initialPath, element },
      { path: '/login', element: <div>Login Page</div> },
      { path: '/', element: <div>Home Page</div> },
    ],
    { initialEntries: [initialPath] },
  )
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('RequireAuth', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a loading state while the session is pending', () => {
    vi.spyOn(session, 'useCurrentUser').mockReturnValue({
      data: undefined,
      isPending: true,
    } as ReturnType<typeof session.useCurrentUser>)

    renderAt('/secret', <RequireAuth><div>Secret</div></RequireAuth>)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('redirects to /login when unauthenticated', () => {
    vi.spyOn(session, 'useCurrentUser').mockReturnValue({
      data: null,
      isPending: false,
    } as ReturnType<typeof session.useCurrentUser>)

    renderAt('/secret', <RequireAuth><div>Secret</div></RequireAuth>)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Secret')).not.toBeInTheDocument()
  })

  it('renders children when authenticated', () => {
    vi.spyOn(session, 'useCurrentUser').mockReturnValue({
      data: {
        id: 'u-1',
        email: 'a@example.com',
        is_active: true,
        is_superuser: false,
        is_verified: false,
      },
      isPending: false,
    } as ReturnType<typeof session.useCurrentUser>)

    renderAt('/secret', <RequireAuth><div>Secret</div></RequireAuth>)
    expect(screen.getByText('Secret')).toBeInTheDocument()
  })
})

describe('RequireGuest', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('redirects authenticated users to /', () => {
    vi.spyOn(session, 'useCurrentUser').mockReturnValue({
      data: {
        id: 'u-1',
        email: 'a@example.com',
        is_active: true,
        is_superuser: false,
        is_verified: false,
      },
      isPending: false,
    } as ReturnType<typeof session.useCurrentUser>)

    renderAt('/secret', <RequireGuest><div>Guest Only</div></RequireGuest>)
    expect(screen.getByText('Home Page')).toBeInTheDocument()
    expect(screen.queryByText('Guest Only')).not.toBeInTheDocument()
  })

  it('renders children for unauthenticated users', () => {
    vi.spyOn(session, 'useCurrentUser').mockReturnValue({
      data: null,
      isPending: false,
    } as ReturnType<typeof session.useCurrentUser>)

    renderAt('/secret', <RequireGuest><div>Guest Only</div></RequireGuest>)
    expect(screen.getByText('Guest Only')).toBeInTheDocument()
  })
})
