import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TableDocModel } from '@/entities/table-doc'
import { TableDocView } from './TableDocView'

const model: TableDocModel = {
  tables: [
    {
      id: 'public.users',
      schema: 'public',
      name: 'users',
      note: 'application users',
      columns: [
        {
          name: 'id',
          type: 'integer',
          pk: true,
          fk: false,
          notNull: true,
          unique: false,
          default: '',
          note: 'primary key',
        },
        {
          name: 'org_id',
          type: 'integer',
          pk: false,
          fk: true,
          notNull: true,
          unique: false,
          default: '',
          note: '',
        },
      ],
      fkTargets: [
        {
          columns: ['org_id'],
          targetTable: 'orgs',
          targetSchema: 'public',
          targetColumns: ['id'],
        },
      ],
    },
  ],
  enums: [
    {
      id: 'public.role',
      schema: 'public',
      name: 'role',
      note: '',
      values: [{ name: 'admin', note: 'super user' }],
    },
  ],
}

describe('TableDocView', () => {
  it('returns null when closed', () => {
    const { container } = render(
      <TableDocView model={model} open={false} onClose={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the table name, a PK cell, an FK target, and an enum value', () => {
    render(<TableDocView model={model} open onClose={() => {}} />)
    expect(screen.getByTestId('table-doc-view')).toBeInTheDocument()
    // Table heading (schema.name).
    expect(
      screen.getByRole('heading', { name: 'public.users' }),
    ).toBeInTheDocument()
    // PK cell shows Y for the id column (scope to the id row — strict-mode safe).
    const idRow = screen.getByText('id').closest('tr')!
    expect(idRow).toHaveTextContent('Y')
    // FK target row: org_id -> public.orgs.id
    expect(screen.getByText('public.orgs.id')).toBeInTheDocument()
    // Enum section value.
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'public.role' }),
    ).toBeInTheDocument()
  })

  it('fires onClose when the Close button is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<TableDocView model={model} open onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
