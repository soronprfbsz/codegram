import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HomePage } from './index'

describe('HomePage', () => {
  it('renders the app heading', () => {
    render(<HomePage />)
    expect(
      screen.getByRole('heading', { name: 'ERD-DBML' }),
    ).toBeInTheDocument()
  })
})
