import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import i18n from '@/shared/i18n'
import { render, screen } from '@testing-library/react'

// 이 스위트는 영어 라벨/문구를 단언하므로 인터페이스 언어를 en으로 고정한다.
beforeAll(async () => {
  await i18n.changeLanguage('en')
})
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegisterForm } from './RegisterForm'

const registerMutateAsync = vi.fn()
const loginMutateAsync = vi.fn()
const navigate = vi.fn()

vi.mock('@/features/auth/api/useRegister', () => ({
  useRegister: () => ({ mutateAsync: registerMutateAsync, isPending: false }),
}))

vi.mock('@/features/auth/api/useLogin', () => ({
  useLogin: () => ({ mutateAsync: loginMutateAsync, isPending: false }),
}))

vi.mock('react-router', () => ({
  useNavigate: () => navigate,
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
      <RegisterForm />
    </QueryClientProvider>,
  )
}

describe('RegisterForm', () => {
  beforeEach(() => {
    registerMutateAsync.mockReset()
    loginMutateAsync.mockReset()
    navigate.mockReset()
  })

  it('renders a "Sign up" heading and email/password/confirm fields', () => {
    renderForm()
    expect(
      screen.getByRole('heading', { name: 'Sign up' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
  })

  it('shows an error when passwords do not match', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText(/^email$/i), 'a@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'password123')
    await user.type(
      screen.getByLabelText(/confirm password/i),
      'different123',
    )
    await user.click(screen.getByRole('button', { name: /sign up/i }))

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
    expect(registerMutateAsync).not.toHaveBeenCalled()
  })

  it('shows an error when the password is too short', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText(/^email$/i), 'a@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'short')
    await user.type(screen.getByLabelText(/confirm password/i), 'short')
    await user.click(screen.getByRole('button', { name: /sign up/i }))

    expect(
      screen.getByText(/password must be at least 8 characters/i),
    ).toBeInTheDocument()
    expect(registerMutateAsync).not.toHaveBeenCalled()
  })

  it('registers then logs in and navigates home on success', async () => {
    registerMutateAsync.mockResolvedValueOnce({
      id: 'u-1',
      email: 'a@example.com',
      is_active: true,
      is_superuser: false,
      is_verified: false,
    })
    loginMutateAsync.mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText(/^email$/i), 'a@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign up/i }))

    expect(registerMutateAsync).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'password123',
    })
    expect(loginMutateAsync).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'password123',
    })
    expect(navigate).toHaveBeenCalledWith('/')
  })
})
