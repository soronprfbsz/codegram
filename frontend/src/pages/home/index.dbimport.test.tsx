import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HomePage } from './index'

vi.mock('@/entities/session', () => ({
  useCurrentUser: () => ({ data: { email: 'a@b.c' } }),
}))
vi.mock('@/features/auth', () => ({ LogoutButton: () => <button>Logout</button> }))
vi.mock('@/features/project-list', () => ({
  ProjectList: () => <div>project-list-stub</div>,
}))
vi.mock('@/features/db-import', () => ({
  DbImportButton: () => <button>Connect to Database</button>,
}))

describe('HomePage db-import entry', () => {
  it('renders the Connect to Database entry point', () => {
    render(<HomePage />)
    expect(
      screen.getByRole('button', { name: 'Connect to Database' }),
    ).toBeInTheDocument()
  })
})
