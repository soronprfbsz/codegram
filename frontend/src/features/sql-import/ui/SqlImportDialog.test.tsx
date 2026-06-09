import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { SqlImportDialog } from './SqlImportDialog'

const setup = () =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

const VALID_SQL =
  'CREATE TABLE users (id SERIAL PRIMARY KEY, email VARCHAR(255) NOT NULL);'
const MALFORMED_SQL = 'CREATE TABLE ((( not valid sql at all'

describe('SqlImportDialog', () => {
  it('converts pasted SQL and calls onImport with DBML on Import', async () => {
    const user = setup()
    const onImport = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <SqlImportDialog
        open
        onOpenChange={onOpenChange}
        hasExistingContent={false}
        onImport={onImport}
      />,
    )
    await user.click(screen.getByTestId('sql-import-textarea'))
    await user.paste(VALID_SQL)
    await user.click(screen.getByRole('button', { name: 'Import' }))
    expect(onImport).toHaveBeenCalledTimes(1)
    const dbml = onImport.mock.calls[0][0] as string
    expect(dbml).toContain('Table')
    expect(dbml).toContain('users')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows errors and does NOT call onImport on malformed SQL', async () => {
    const user = setup()
    const onImport = vi.fn()
    render(
      <SqlImportDialog
        open
        onOpenChange={vi.fn()}
        hasExistingContent={false}
        onImport={onImport}
      />,
    )
    await user.click(screen.getByTestId('sql-import-textarea'))
    await user.paste(MALFORMED_SQL)
    await user.click(screen.getByRole('button', { name: 'Import' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onImport).not.toHaveBeenCalled()
  })

  it('gates a valid import behind overwrite-confirm when content exists', async () => {
    const user = setup()
    const onImport = vi.fn()
    render(
      <SqlImportDialog
        open
        onOpenChange={vi.fn()}
        hasExistingContent
        onImport={onImport}
      />,
    )
    await user.click(screen.getByTestId('sql-import-textarea'))
    await user.paste(VALID_SQL)
    await user.click(screen.getByRole('button', { name: 'Import' }))
    // confirm step shown, not yet imported
    expect(onImport).not.toHaveBeenCalled()
    const confirm = await screen.findByRole('button', {
      name: 'Confirm overwrite',
    })
    await user.click(confirm)
    expect(onImport).toHaveBeenCalledTimes(1)
    expect(onImport.mock.calls[0][0]).toContain('users')
  })
})
