import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './dropdown-menu'

function Harness({ onPick }: { onPick: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Section</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onPick}>First</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Second</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// radix DropdownMenu opens on pointerdown + portals its content; disable the
// pointer-events check so userEvent drives the trigger in JSDOM.
const setup = () =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

describe('dropdown-menu', () => {
  it('renders the trigger and is closed by default', () => {
    render(<Harness onPick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'First' })).toBeNull()
  })

  it('opens on trigger click and reveals items', async () => {
    const user = setup()
    render(<Harness onPick={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(
      await screen.findByRole('menuitem', { name: 'First' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Second' })).toBeInTheDocument()
  })

  it('fires onSelect when an item is clicked', async () => {
    const user = setup()
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.click(await screen.findByRole('menuitem', { name: 'First' }))
    expect(onPick).toHaveBeenCalledTimes(1)
  })
})
