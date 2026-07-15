import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { render, screen } from '@testing-library/react'

// 이 스위트는 영어 라벨/문구를 단언하므로 인터페이스 언어를 en으로 고정한다.
beforeAll(async () => {
  await i18n.changeLanguage('en')
})
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoginForm } from './LoginForm'

const mutateAsync = vi.fn()
const navigate = vi.fn()

vi.mock('@/features/auth/api/useLogin', () => ({
  useLogin: () => ({ mutateAsync, isPending: false }),
}))

vi.mock('react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('@/entities/account', () => ({
  useAdminContacts: () => ({ data: [], isLoading: false }),
}))

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginForm />
    </QueryClientProvider>,
  )
}

describe('LoginForm', () => {
  beforeEach(() => {
    mutateAsync.mockReset()
    navigate.mockReset()
  })

  it('renders a "Log in" heading and email/password fields', () => {
    renderForm()
    expect(
      screen.getByRole('heading', { name: 'Log in' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('shows a "Reset password" trigger for locked-out users', () => {
    renderForm()
    expect(
      screen.getByRole('button', { name: /forgot your password/i }),
    ).toBeInTheDocument()
  })

  it('shows a validation error when fields are empty', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /log in/i }))
    expect(
      screen.getByText(/email and password are required/i),
    ).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('submits credentials and navigates home on success', async () => {
    mutateAsync.mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText(/email/i), 'a@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(mutateAsync).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'password123',
    })
    expect(navigate).toHaveBeenCalledWith('/')
  })

  it('shows an error message when login fails', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('Login failed'))
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText(/email/i), 'a@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrongpass')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/login failed/i)
    expect(navigate).not.toHaveBeenCalled()
  })
})
