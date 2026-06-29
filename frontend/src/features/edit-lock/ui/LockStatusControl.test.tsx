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
})
