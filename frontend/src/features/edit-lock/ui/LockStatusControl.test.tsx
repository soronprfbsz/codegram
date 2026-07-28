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
    expect(screen.getByTestId('lock-editing-by')).toHaveTextContent('bob@example.com')
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

  it('renders nothing when the caller holds the lock', () => {
    const { container } = render(
      <LockStatusControl canEdit lease={lease({ isHolder: true })} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  // ADR-0024: losing the lease is news the topbar delivers at once, with a way
  // back — the old build said nothing until a save was rejected.
  it('tells an editor they lost the lease and offers to resume when it is free', () => {
    const takeover = vi.fn()
    render(
      <LockStatusControl
        canEdit
        lease={lease({ lostLease: true, lockedByOther: false, takeover })}
      />,
    )
    expect(screen.getByTestId('lock-lost')).toHaveTextContent(
      '편집 권한을 잃었습니다',
    )
    const resume = screen.getByTestId('lock-resume')
    expect(resume).not.toBeDisabled()
    fireEvent.click(resume)
    expect(takeover).toHaveBeenCalled()
  })

  it('names who took over, and cannot resume while they still hold it', () => {
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
      'bob@example.com 님이 편집을 이어받았습니다',
    )
    expect(screen.getByTestId('lock-resume')).toBeDisabled()
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
