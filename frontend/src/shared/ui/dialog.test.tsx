import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from './dialog'

function Harness() {
  return (
    <Dialog>
      <DialogTrigger>Open dialog</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import SQL</DialogTitle>
          <DialogDescription>Paste or upload a schema.</DialogDescription>
        </DialogHeader>
        <p>Body content</p>
        <DialogClose>Cancel</DialogClose>
      </DialogContent>
    </Dialog>
  )
}

// radix Dialog opens on pointerdown + portals its content; disable the
// pointer-events check so userEvent drives the trigger in JSDOM.
const setup = () =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

describe('dialog', () => {
  it('renders the trigger and is closed by default', () => {
    render(<Harness />)
    expect(
      screen.getByRole('button', { name: 'Open dialog' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Body content')).toBeNull()
  })

  it('opens on trigger click and reveals title and body', async () => {
    const user = setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open dialog' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Import SQL')).toBeInTheDocument()
    expect(screen.getByText('Body content')).toBeInTheDocument()
  })

  it('closes when the Close button is clicked', async () => {
    const user = setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open dialog' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
