import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BumpedDialog } from './BumpedDialog'

describe('BumpedDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('copies the current DBML to the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(
      <BumpedDialog open onOpenChange={() => {}} dbmlText="Table t {}" />,
    )
    fireEvent.click(screen.getByTestId('edit-lock-copy'))
    expect(writeText).toHaveBeenCalledWith('Table t {}')
  })

  it('does not render when closed', () => {
    render(<BumpedDialog open={false} onOpenChange={() => {}} dbmlText="x" />)
    expect(screen.queryByTestId('edit-lock-bumped')).toBeNull()
  })
})
