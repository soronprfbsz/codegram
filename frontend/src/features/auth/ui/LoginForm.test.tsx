import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
