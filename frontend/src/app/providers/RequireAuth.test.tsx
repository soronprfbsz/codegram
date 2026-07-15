import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RequireAuth,
  RequireGuest,
  RequirePasswordOk,
  RequireMustChangePassword,
} from './RequireAuth'
import * as session from '@/entities/session'
import * as account from '@/entities/account'

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

function renderPasswordGuardAt(
  initialPath: string,
  element: React.ReactElement,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const routes = [{ path: initialPath, element }]
  if (initialPath !== '/') {
    routes.push({ path: '/', element: <div>Home Page</div> })
  }
  if (initialPath !== '/force-password-change') {
    routes.push({
      path: '/force-password-change',
      element: <div>Force Change Page</div>,
    })
  }
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

function mockMe(mustChangePassword: boolean, isPending = false) {
  vi.spyOn(account, 'useMe').mockReturnValue({
    data: isPending
      ? undefined
      : {
          id: 'u-1',
          email: 'a@example.com',
          role_name: 'user',
          permissions: [],
          must_change_password: mustChangePassword,
        },
    isPending,
  } as ReturnType<typeof account.useMe>)
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

describe('RequirePasswordOk', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a loading state while /account/me is pending', () => {
    mockMe(false, true)
    renderPasswordGuardAt(
      '/secret',
      <RequirePasswordOk><div>Secret</div></RequirePasswordOk>,
    )
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('redirects to /force-password-change when must_change_password is true', () => {
    mockMe(true)
    renderPasswordGuardAt(
      '/secret',
      <RequirePasswordOk><div>Secret</div></RequirePasswordOk>,
    )
    expect(screen.getByText('Force Change Page')).toBeInTheDocument()
    expect(screen.queryByText('Secret')).not.toBeInTheDocument()
  })

  it('renders children when must_change_password is false', () => {
    mockMe(false)
    renderPasswordGuardAt(
      '/secret',
      <RequirePasswordOk><div>Secret</div></RequirePasswordOk>,
    )
    expect(screen.getByText('Secret')).toBeInTheDocument()
  })
})

describe('RequireMustChangePassword', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('redirects to / when must_change_password is false', () => {
    mockMe(false)
    renderPasswordGuardAt(
      '/force-password-change',
      <RequireMustChangePassword><div>Force Form</div></RequireMustChangePassword>,
    )
    expect(screen.getByText('Home Page')).toBeInTheDocument()
    expect(screen.queryByText('Force Form')).not.toBeInTheDocument()
  })

  it('renders children when must_change_password is true', () => {
    mockMe(true)
    renderPasswordGuardAt(
      '/force-password-change',
      <RequireMustChangePassword><div>Force Form</div></RequireMustChangePassword>,
    )
    expect(screen.getByText('Force Form')).toBeInTheDocument()
  })
})
