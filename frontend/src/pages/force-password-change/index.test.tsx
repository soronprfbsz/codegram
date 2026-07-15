import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { render, screen } from '@testing-library/react'

// 이 스위트는 영어 라벨/문구를 단언하므로 인터페이스 언어를 en으로 고정한다.
beforeAll(async () => {
  await i18n.changeLanguage('en')
})
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ForcePasswordChangePage } from './index'
import * as account from '@/entities/account'
import { meQueryKey } from '@/entities/account'

const navigate = vi.fn()

vi.mock('react-router', () => ({
  useNavigate: () => navigate,
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ForcePasswordChangePage />
    </QueryClientProvider>,
  )
  return queryClient
}

describe('ForcePasswordChangePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    navigate.mockReset()
  })

  it('renders new-password and confirm-password fields', () => {
    vi.spyOn(account, 'useChangePassword').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof account.useChangePassword>)

    renderPage()

    expect(screen.getByTestId('force-new-password-input')).toBeInTheDocument()
    expect(
      screen.getByTestId('force-confirm-password-input'),
    ).toBeInTheDocument()
  })

  it('shows an error when passwords do not match', async () => {
    const mutateAsync = vi.fn()
    vi.spyOn(account, 'useChangePassword').mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof account.useChangePassword>)

    const user = userEvent.setup()
    renderPage()

    await user.type(
      screen.getByTestId('force-new-password-input'),
      'password123',
    )
    await user.type(
      screen.getByTestId('force-confirm-password-input'),
      'different123',
    )
    await user.click(screen.getByTestId('force-password-submit'))

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('shows an error when the new password is too short', async () => {
    const mutateAsync = vi.fn()
    vi.spyOn(account, 'useChangePassword').mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof account.useChangePassword>)

    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByTestId('force-new-password-input'), 'short')
    await user.type(screen.getByTestId('force-confirm-password-input'), 'short')
    await user.click(screen.getByTestId('force-password-submit'))

    expect(
      screen.getByText(/password must be at least 8 characters/i),
    ).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('calls useChangePassword with current_password null and navigates home on success', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ ok: true })
    vi.spyOn(account, 'useChangePassword').mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof account.useChangePassword>)

    const user = userEvent.setup()
    const queryClient = renderPage()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    await user.type(
      screen.getByTestId('force-new-password-input'),
      'password123',
    )
    await user.type(
      screen.getByTestId('force-confirm-password-input'),
      'password123',
    )
    await user.click(screen.getByTestId('force-password-submit'))

    expect(mutateAsync).toHaveBeenCalledWith({
      current_password: null,
      new_password: 'password123',
    })
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: meQueryKey }),
    )
  })

  it('shows a generic error (not the current-password-wrong message) when the mutation fails', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('network error'))
    vi.spyOn(account, 'useChangePassword').mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof account.useChangePassword>)

    const user = userEvent.setup()
    renderPage()

    await user.type(
      screen.getByTestId('force-new-password-input'),
      'password123',
    )
    await user.type(
      screen.getByTestId('force-confirm-password-input'),
      'password123',
    )
    await user.click(screen.getByTestId('force-password-submit'))

    expect(
      await screen.findByText(/failed to change password/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/current password is incorrect/i)).toBeNull()
  })
})
