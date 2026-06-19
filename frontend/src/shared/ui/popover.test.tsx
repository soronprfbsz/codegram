import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { Popover, PopoverTrigger, PopoverContent } from './popover'

function Harness() {
  return (
    <Popover>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent>
        <span>Panel</span>
      </PopoverContent>
    </Popover>
  )
}

const setup = () =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

describe('popover', () => {
  it('is closed by default', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
    expect(screen.queryByText('Panel')).toBeNull()
  })

  it('opens on trigger click', async () => {
    const user = setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByText('Panel')).toBeInTheDocument()
  })
})
