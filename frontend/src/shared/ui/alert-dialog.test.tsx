import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AlertDialog } from './alert-dialog'

describe('AlertDialog', () => {
  it('shows the message and dismisses itself', () => {
    const onOpenChange = vi.fn()
    render(
      <AlertDialog
        open
        onOpenChange={onOpenChange}
        title="원복하지 못했습니다"
        description="편집 권한이 없어 원복할 수 없습니다."
      />,
    )
    const dialog = screen.getByTestId('alert-dialog')
    expect(dialog).toHaveTextContent('원복하지 못했습니다')
    expect(dialog).toHaveTextContent('편집 권한이 없어 원복할 수 없습니다.')

    fireEvent.click(screen.getByTestId('alert-dialog-ok'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('offers nothing to decide — one button, no cancel', () => {
    render(<AlertDialog open onOpenChange={() => {}} title="X" testId="notice" />)
    expect(screen.getByTestId('notice-ok')).toBeInTheDocument()
    expect(screen.queryByTestId('notice-cancel')).toBeNull()
  })

  it('does not render when closed', () => {
    render(<AlertDialog open={false} onOpenChange={() => {}} title="X" />)
    expect(screen.queryByTestId('alert-dialog')).toBeNull()
  })
})
