import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { render, screen, waitFor } from '@testing-library/react'

// 이 스위트는 영어 라벨/문구를 단언하므로 인터페이스 언어를 en으로 고정한다.
beforeAll(async () => {
  await i18n.changeLanguage('en')
})
import userEvent from '@testing-library/user-event'
import { AccountSettingsDialog } from './AccountSettingsDialog'
import * as account from '@/entities/account'

function renderDialog() {
  return render(
    <AccountSettingsDialog open onOpenChange={() => {}} />,
  )
}

describe('AccountSettingsDialog — password change section', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders current/new/confirm password fields', () => {
    vi.spyOn(account, 'useChangePassword').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof account.useChangePassword>)

    renderDialog()

    expect(
      screen.getByTestId('account-current-password-input'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('account-new-password-input')).toBeInTheDocument()
    expect(
      screen.getByTestId('account-confirm-password-input'),
    ).toBeInTheDocument()
  })

  it('shows an error when the new password and confirmation do not match', async () => {
    const mutateAsync = vi.fn()
    vi.spyOn(account, 'useChangePassword').mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof account.useChangePassword>)

    const user = userEvent.setup()
    renderDialog()

    await user.type(
      screen.getByTestId('account-current-password-input'),
      'current123',
    )
    await user.type(screen.getByTestId('account-new-password-input'), 'newpass123')
    await user.type(
      screen.getByTestId('account-confirm-password-input'),
      'different123',
    )
    await user.click(screen.getByTestId('account-change-password-submit'))

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
    renderDialog()

    await user.type(
      screen.getByTestId('account-current-password-input'),
      'current123',
    )
    await user.type(screen.getByTestId('account-new-password-input'), 'short')
    await user.type(screen.getByTestId('account-confirm-password-input'), 'short')
    await user.click(screen.getByTestId('account-change-password-submit'))

    expect(
      screen.getByText(/password must be at least 8 characters/i),
    ).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('submits current + new password and shows success feedback', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ ok: true })
    vi.spyOn(account, 'useChangePassword').mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof account.useChangePassword>)

    const user = userEvent.setup()
    renderDialog()

    await user.type(
      screen.getByTestId('account-current-password-input'),
      'current123',
    )
    await user.type(screen.getByTestId('account-new-password-input'), 'newpass123')
    await user.type(
      screen.getByTestId('account-confirm-password-input'),
      'newpass123',
    )
    await user.click(screen.getByTestId('account-change-password-submit'))

    expect(mutateAsync).toHaveBeenCalledWith({
      current_password: 'current123',
      new_password: 'newpass123',
    })
    await waitFor(() =>
      expect(
        screen.getByTestId('account-change-password-success'),
      ).toBeInTheDocument(),
    )
  })

  it('shows a server error message on failure', async () => {
    const mutateAsync = vi
      .fn()
      .mockRejectedValue(new Error('invalid current password'))
    vi.spyOn(account, 'useChangePassword').mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof account.useChangePassword>)

    const user = userEvent.setup()
    renderDialog()

    await user.type(
      screen.getByTestId('account-current-password-input'),
      'wrongcurrent',
    )
    await user.type(screen.getByTestId('account-new-password-input'), 'newpass123')
    await user.type(
      screen.getByTestId('account-confirm-password-input'),
      'newpass123',
    )
    await user.click(screen.getByTestId('account-change-password-submit'))

    await waitFor(() =>
      expect(
        screen.getByTestId('account-change-password-error'),
      ).toBeInTheDocument(),
    )
  })
})
