import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AccountsPage } from './index'
import * as account from '@/entities/account'

const accounts: account.Account[] = [
  { id: 'a-1', email: 'admin@example.com', role_name: 'admin' },
  { id: 'a-2', email: 'user@example.com', role_name: 'user' },
]

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountsPage />
    </QueryClientProvider>,
  )
}

function mockMe(permissions: string[]) {
  vi.spyOn(account, 'useMe').mockReturnValue({
    data: {
      id: 'me-1',
      email: 'me@example.com',
      role_name: 'admin',
      permissions,
      must_change_password: false,
    },
    isPending: false,
  } as ReturnType<typeof account.useMe>)
}

describe('AccountsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(account, 'useAccounts').mockReturnValue({
      data: accounts,
      isPending: false,
    } as ReturnType<typeof account.useAccounts>)
    vi.spyOn(account, 'useUpdateAccountRole').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof account.useUpdateAccountRole>)
  })

  it('renders account rows with email and role', () => {
    mockMe(['user:read', 'user:manage'])
    vi.spyOn(account, 'useResetPassword').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof account.useResetPassword>)

    renderPage()

    expect(screen.getByText('admin@example.com')).toBeInTheDocument()
    expect(screen.getByText('user@example.com')).toBeInTheDocument()
  })

  it('shows role select + reset button when the caller has user:manage, and reset opens a temp-password modal', async () => {
    mockMe(['user:read', 'user:manage'])
    const mutateAsync = vi
      .fn()
      .mockResolvedValue({ temp_password: 'Temp1234Abc' })
    vi.spyOn(account, 'useResetPassword').mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof account.useResetPassword>)

    const user = userEvent.setup()
    renderPage()

    expect(screen.getByTestId('account-role-select-a-1')).toBeInTheDocument()
    const resetButton = screen.getByTestId('account-reset-button-a-1')
    expect(resetButton).toBeInTheDocument()

    await user.click(resetButton)

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('a-1'))
    expect(await screen.findByTestId('account-reset-modal')).toBeInTheDocument()
    expect(screen.getByText('Temp1234Abc')).toBeInTheDocument()
  })

  it('renders read-only (no select, no reset button) when the caller only has user:read', () => {
    mockMe(['user:read'])
    vi.spyOn(account, 'useResetPassword').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof account.useResetPassword>)

    renderPage()

    expect(
      screen.queryByTestId('account-role-select-a-1'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('account-reset-button-a-1'),
    ).not.toBeInTheDocument()
  })
})
