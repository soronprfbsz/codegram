import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AccountsPage } from './index'
import * as account from '@/entities/account'
import { copyText } from '@/shared/lib/copyText'
import { ApiError } from '@/shared/api/client'

vi.mock('@/shared/lib/copyText', () => ({
  copyText: vi.fn().mockResolvedValue(true),
}))

const roles: account.Role[] = [
  { id: 'r-admin', name: 'admin', permissions: ['user:read', 'user:manage'] },
  { id: 'r-user', name: 'user', permissions: ['user:read'] },
]

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

  it('reset requires confirming a warning dialog before it issues a temp password', async () => {
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
    await user.click(screen.getByTestId('account-reset-button-a-1'))

    // Warning dialog appears; the reset has NOT run yet.
    expect(
      await screen.findByTestId('account-reset-confirm-a-1'),
    ).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()

    // Confirming runs the reset and reveals the temp-password modal.
    await user.click(screen.getByTestId('account-reset-confirm-a-1-ok'))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('a-1'))
    expect(await screen.findByTestId('account-reset-modal')).toBeInTheDocument()
    expect(screen.getByText('Temp1234Abc')).toBeInTheDocument()
  })

  it('cancelling the warning dialog does not reset the password', async () => {
    mockMe(['user:read', 'user:manage'])
    const mutateAsync = vi.fn().mockResolvedValue({ temp_password: 'X' })
    vi.spyOn(account, 'useResetPassword').mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof account.useResetPassword>)

    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByTestId('account-reset-button-a-1'))
    await screen.findByTestId('account-reset-confirm-a-1')
    await user.click(screen.getByTestId('account-reset-confirm-a-1-cancel'))

    expect(mutateAsync).not.toHaveBeenCalled()
    expect(screen.queryByTestId('account-reset-modal')).not.toBeInTheDocument()
  })

  it('copies the temp password to the clipboard and reflects success', async () => {
    mockMe(['user:read', 'user:manage'])
    vi.mocked(copyText).mockResolvedValue(true)
    vi.spyOn(account, 'useResetPassword').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ temp_password: 'Temp1234Abc' }),
      isPending: false,
    } as unknown as ReturnType<typeof account.useResetPassword>)

    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByTestId('account-reset-button-a-1'))
    await user.click(screen.getByTestId('account-reset-confirm-a-1-ok'))
    await screen.findByTestId('account-reset-modal')

    const copyBtn = screen.getByTestId('account-reset-copy')
    const before = copyBtn.textContent
    await user.click(copyBtn)

    // The copy helper is invoked with the temp password, and the label flips to
    // the success state (language-agnostic: it changed from the idle label).
    await waitFor(() => expect(copyText).toHaveBeenCalledWith('Temp1234Abc'))
    await waitFor(() => expect(copyBtn.textContent).not.toBe(before))
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

describe('AccountsPage permission matrix tab', () => {
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
    vi.spyOn(account, 'useResetPassword').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof account.useResetPassword>)
    vi.spyOn(account, 'useRoles').mockReturnValue({
      data: roles,
      isPending: false,
    } as ReturnType<typeof account.useRoles>)
  })

  function mockUpdateRolePermissions(
    overrides: Partial<ReturnType<typeof account.useUpdateRolePermissions>> = {},
  ) {
    const mutate = vi.fn()
    const mock = {
      mutate,
      isPending: false,
      isError: false,
      error: null,
      ...overrides,
    } as unknown as ReturnType<typeof account.useUpdateRolePermissions>
    vi.spyOn(account, 'useUpdateRolePermissions').mockReturnValue(mock)
    return mutate
  }

  it('shows the 권한 관리 tab when the caller has user:manage', () => {
    mockMe(['user:read', 'user:manage'])
    mockUpdateRolePermissions()

    renderPage()

    expect(
      screen.getByTestId('accounts-tab-permissions'),
    ).toBeInTheDocument()
  })

  it('hides the 권한 관리 tab when the caller only has user:read', () => {
    mockMe(['user:read'])
    mockUpdateRolePermissions()

    renderPage()

    expect(
      screen.queryByTestId('accounts-tab-permissions'),
    ).not.toBeInTheDocument()
  })

  it('renders a role x permission matrix with checked state from useRoles', async () => {
    mockMe(['user:read', 'user:manage'])
    mockUpdateRolePermissions()
    const user = userEvent.setup()

    renderPage()
    await user.click(screen.getByTestId('accounts-tab-permissions'))

    const adminManage = screen.getByTestId(
      'role-permission-admin-user:manage',
    )
    const userManage = screen.getByTestId('role-permission-user-user:manage')
    const userRead = screen.getByTestId('role-permission-user-user:read')

    expect(adminManage).toHaveAttribute('data-state', 'checked')
    expect(userManage).toHaveAttribute('data-state', 'unchecked')
    expect(userRead).toHaveAttribute('data-state', 'checked')
  })

  it('toggling a permission calls useUpdateRolePermissions with the role id + new codes', async () => {
    mockMe(['user:read', 'user:manage'])
    const mutate = mockUpdateRolePermissions()
    const user = userEvent.setup()

    renderPage()
    await user.click(screen.getByTestId('accounts-tab-permissions'))
    await user.click(screen.getByTestId('role-permission-user-user:manage'))

    expect(mutate).toHaveBeenCalledWith({
      roleId: 'r-user',
      permissionCodes: ['user:read', 'user:manage'],
    })
  })

  it('renders every catalog permission column even when no role currently holds it', async () => {
    mockMe(['user:read', 'user:manage'])
    mockUpdateRolePermissions()
    vi.spyOn(account, 'useRoles').mockReturnValue({
      data: [
        { id: 'r-admin', name: 'admin', permissions: ['user:read'] },
        { id: 'r-user', name: 'user', permissions: ['user:read'] },
      ],
      isPending: false,
    } as ReturnType<typeof account.useRoles>)
    const user = userEvent.setup()

    renderPage()
    await user.click(screen.getByTestId('accounts-tab-permissions'))

    expect(
      screen.getByTestId('role-permission-admin-user:read'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('role-permission-admin-user:manage'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('role-permission-admin-user:manage'),
    ).toHaveAttribute('data-state', 'unchecked')
  })

  it('surfaces an inline error on a 409 admin_manage_required rejection without crashing', async () => {
    mockMe(['user:read', 'user:manage'])
    mockUpdateRolePermissions({
      isError: true,
      error: new ApiError('Conflict', 409, 'admin_manage_required'),
    })
    const user = userEvent.setup()

    renderPage()
    await user.click(screen.getByTestId('accounts-tab-permissions'))

    expect(
      screen.getByTestId('role-permission-error-admin'),
    ).toBeInTheDocument()
  })
})
