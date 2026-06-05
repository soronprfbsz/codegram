import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ParseErrorPanel } from './ParseErrorPanel'

describe('ParseErrorPanel', () => {
  it('shows a valid status when there are no errors', () => {
    render(<ParseErrorPanel status="success" />)
    expect(screen.getByText(/valid dbml/i)).toBeInTheDocument()
  })

  it('shows a parsing status while pending', () => {
    render(<ParseErrorPanel status="pending" />)
    expect(screen.getByText(/parsing/i)).toBeInTheDocument()
  })

  it('lists errors with line/column when present', () => {
    render(
      <ParseErrorPanel
        status="error"
        errors={[
          { message: 'Unexpected end of input', line: 3, column: 1 },
          { message: 'Expected a closing brace' },
        ]}
      />,
    )
    expect(
      screen.getByText(/unexpected end of input/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/line 3, column 1/i)).toBeInTheDocument()
    expect(
      screen.getByText(/expected a closing brace/i),
    ).toBeInTheDocument()
  })

  it('announces errors via a live region', () => {
    render(
      <ParseErrorPanel
        status="error"
        errors={[{ message: 'Unexpected end of input' }]}
      />,
    )
    const region = screen.getByRole('alert')
    expect(region).toHaveAttribute('aria-live', 'polite')
  })
})
