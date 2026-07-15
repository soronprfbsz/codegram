import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { render, screen } from '@testing-library/react'

// 이 스위트는 영어 라벨/문구를 단언하므로 인터페이스 언어를 en으로 고정한다.
beforeAll(async () => {
  await i18n.changeLanguage('en')
})
import userEvent from '@testing-library/user-event'
import { PasswordResetHelp } from './PasswordResetHelp'

const useAdminContacts = vi.fn()

vi.mock('@/entities/account', () => ({
  useAdminContacts: () => useAdminContacts(),
}))

describe('PasswordResetHelp', () => {
  beforeEach(() => {
    useAdminContacts.mockReset()
  })

  it('renders a "Reset password" trigger button', () => {
    useAdminContacts.mockReturnValue({ data: undefined, isLoading: false })
    render(<PasswordResetHelp />)
    expect(
      screen.getByRole('button', { name: /reset password/i }),
    ).toBeInTheDocument()
  })

  it('lists admin emails from the hook when the trigger is clicked', async () => {
    useAdminContacts.mockReturnValue({
      data: [{ email: 'admin1@example.com' }, { email: 'admin2@example.com' }],
      isLoading: false,
    })
    const user = userEvent.setup()
    render(<PasswordResetHelp />)

    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(screen.getByText('admin1@example.com')).toBeInTheDocument()
    expect(screen.getByText('admin2@example.com')).toBeInTheDocument()
  })

  it('shows a fallback message when there are no admins', async () => {
    useAdminContacts.mockReturnValue({ data: [], isLoading: false })
    const user = userEvent.setup()
    render(<PasswordResetHelp />)

    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(
      screen.getByText(/no admins are registered/i),
    ).toBeInTheDocument()
  })
})
