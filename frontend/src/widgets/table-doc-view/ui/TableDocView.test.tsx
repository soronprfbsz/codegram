import { describe, it, expect, vi, beforeAll } from 'vitest'
import i18n from '@/shared/i18n'
import { render, screen } from '@testing-library/react'

// 이 스위트는 영어 라벨/문구를 단언하므로 인터페이스 언어를 en으로 고정한다.
beforeAll(async () => {
  await i18n.changeLanguage('en')
})
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
      checks: [
        { expression: 'org_id > 0', name: 'users_org_chk', values: [] },
        {
          expression: "status IN ('active', 'disabled')",
          name: 'users_status_chk',
          values: ['active', 'disabled'],
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

  it('renders the table name, a PK cell, and an enum value', () => {
    render(<TableDocView model={model} open onClose={() => {}} />)
    expect(screen.getByTestId('table-doc-view')).toBeInTheDocument()
    // Table heading (schema.name).
    expect(
      screen.getByRole('heading', { name: 'public.users' }),
    ).toBeInTheDocument()
    // PK cell shows Y for the id column (scope to the id row — strict-mode safe).
    const idRow = screen.getByText('id').closest('tr')!
    expect(idRow).toHaveTextContent('Y')
    // Column headers are translated (English UI) — not hardcoded Korean.
    expect(screen.getByRole('columnheader', { name: 'Type' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Description' })).toBeInTheDocument()
    // Enum section value.
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'public.role' }),
    ).toBeInTheDocument()
  })

  it('renders CHECK constraints with synthesized enum-style allowed values', () => {
    render(<TableDocView model={model} open onClose={() => {}} />)
    expect(
      screen.getByRole('heading', { name: 'Check constraints' }),
    ).toBeInTheDocument()
    // Raw check expression preserved.
    expect(screen.getByText('org_id > 0')).toBeInTheDocument()
    expect(screen.getByText('users_org_chk')).toBeInTheDocument()
    // Enum-style check: each allowed value rendered as its own chip.
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(screen.getByText('disabled')).toBeInTheDocument()
  })

  it('fires onClose when the Close button is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<TableDocView model={model} open onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders an empty tbody for a table with zero columns', () => {
    const emptyColsModel: TableDocModel = {
      tables: [
        {
          id: 'public.blank',
          schema: 'public',
          name: 'blank',
          note: '',
          columns: [],
          fkTargets: [],
          checks: [],
        },
      ],
      enums: [],
    }
    const { container } = render(
      <TableDocView model={emptyColsModel} open onClose={() => {}} />,
    )
    expect(
      screen.getByRole('heading', { name: 'public.blank' }),
    ).toBeInTheDocument()
    // The column table renders a header row but no body rows.
    const tbody = container.querySelector('tbody')!
    expect(tbody.querySelectorAll('tr')).toHaveLength(0)
  })
})
