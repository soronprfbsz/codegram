import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LockStatusControl } from './LockStatusControl'
import type { EditLease } from '../api/useEditLease'

function lease(over: Partial<EditLease> = {}): EditLease {
  return {
    status: undefined,
    readOnly: false,
    isHolder: false,
    lockedByOther: false,
    holderEmail: null,
    canForce: false,
    bumped: false,
    editMode: false,
    enterEditMode: vi.fn(),
    exitEditMode: vi.fn(),
    enterBlocked: false,
    clearEnterBlocked: vi.fn(),
    entering: false,
    lostLease: false,
    conflictReason: null,
    takeover: vi.fn(),
    force: vi.fn(),
    clearBumped: vi.fn(),
    reportConflict: vi.fn(),
    ...over,
  }
}

describe('LockStatusControl', () => {
  it('shows a read-only badge for viewers', () => {
    render(<LockStatusControl canEdit={false} lease={lease()} />)
    expect(screen.getByTestId('lock-readonly-viewer')).toBeInTheDocument()
  })

  it('shows "editing by" when another holds the lock, no force without ownership', () => {
    render(
      <LockStatusControl
        canEdit
        lease={lease({ lockedByOther: true, holderEmail: 'bob@example.com' })}
      />,
    )
    expect(screen.getByTestId('lock-editing-by')).toHaveTextContent('bob 님이 편집 중')
    expect(screen.queryByTestId('lock-force')).toBeNull()
  })

  it('lets an owner force-takeover a live lock', () => {
    const force = vi.fn()
    render(
      <LockStatusControl
        canEdit
        lease={lease({ lockedByOther: true, canForce: true, force })}
      />,
    )
    fireEvent.click(screen.getByTestId('lock-force'))
    expect(force).toHaveBeenCalledOnce()
  })

  // ADR-0025: editing is a mode, so the topbar carries a two-way switch. It
  // shows the state you are in AND the one you can move to.
  it('sits on 읽기 and moves to 편집', () => {
    const enterEditMode = vi.fn()
    render(<LockStatusControl canEdit lease={lease({ enterEditMode })} />)

    expect(screen.getByTestId('mode-switch-read')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('mode-switch-edit')).toBeEnabled()
    fireEvent.click(screen.getByTestId('mode-switch-edit'))
    expect(enterEditMode).toHaveBeenCalled()
  })

  it('sits on 편집 once editing, and moves back', () => {
    const exitEditMode = vi.fn()
    render(
      <LockStatusControl
        canEdit
        lease={lease({ editMode: true, isHolder: true, exitEditMode })}
      />,
    )

    expect(screen.getByTestId('mode-switch-edit')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByTestId('mode-switch-read'))
    expect(exitEditMode).toHaveBeenCalled()
  })

  it('closes the 편집 side, with the reason, while someone else holds the lease', () => {
    render(
      <LockStatusControl
        canEdit
        lease={lease({ lockedByOther: true, holderEmail: 'bob@example.com' })}
      />,
    )
    const edit = screen.getByTestId('mode-switch-edit')
    expect(edit).toBeDisabled()
    // The reason travels with the disabled control, not just beside it.
    expect(edit).toHaveAttribute('title', expect.stringContaining('bob@example.com'))
    expect(screen.getByTestId('lock-editing-by')).toHaveTextContent('bob 님이 편집 중')
  })

  // ADR-0024: losing the lease is news the topbar delivers at once, with a way
  // back — the old build said nothing until a save was rejected.
  it('tells an editor they lost the lease; the switch is the way back', () => {
    const enterEditMode = vi.fn()
    render(
      <LockStatusControl
        canEdit
        lease={lease({ lostLease: true, lockedByOther: false, enterEditMode })}
      />,
    )
    expect(screen.getByTestId('lock-lost')).toHaveTextContent(
      '편집 권한을 잃었습니다',
    )
    // No separate "resume" button: the lease is free, so 편집 is simply open
    // again. One control for one decision.
    const edit = screen.getByTestId('mode-switch-edit')
    expect(edit).toBeEnabled()
    fireEvent.click(edit)
    expect(enterEditMode).toHaveBeenCalled()
  })

  it('names who took over, and keeps 편집 closed while they hold it', () => {
    render(
      <LockStatusControl
        canEdit
        lease={lease({
          lostLease: true,
          lockedByOther: true,
          holderEmail: 'bob@example.com',
        })}
      />,
    )
    expect(screen.getByTestId('lock-lost')).toHaveTextContent(
      'bob 님이 편집을 이어받았습니다',
    )
    expect(screen.getByTestId('mode-switch-edit')).toBeDisabled()
  })

  it('gives the owner force-takeover instead of a disabled resume', () => {
    const force = vi.fn()
    render(
      <LockStatusControl
        canEdit
        lease={lease({
          lostLease: true,
          lockedByOther: true,
          canForce: true,
          holderEmail: 'bob@example.com',
          force,
        })}
      />,
    )
    expect(screen.queryByTestId('lock-resume')).toBeNull()
    fireEvent.click(screen.getByTestId('lock-force'))
    expect(force).toHaveBeenCalled()
  })
})
