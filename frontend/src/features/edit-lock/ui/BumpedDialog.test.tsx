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

  it('blames a takeover only when the lease actually changed hands', () => {
    const { rerender } = render(
      <BumpedDialog open onOpenChange={() => {}} dbmlText="x" reason="edit_locked" />,
    )
    expect(screen.getByTestId('edit-lock-bumped')).toHaveTextContent(
      '편집 권한이 넘어갔습니다',
    )

    // stale_version means nobody took the lease — saying they did would send
    // the user chasing a colleague who never touched the project.
    rerender(
      <BumpedDialog open onOpenChange={() => {}} dbmlText="x" reason="stale_version" />,
    )
    const dialog = screen.getByTestId('edit-lock-bumped')
    expect(dialog).toHaveTextContent('이 창의 내용이 최신이 아닙니다')
    expect(dialog).not.toHaveTextContent('편집 권한이 넘어갔습니다')
  })
})
