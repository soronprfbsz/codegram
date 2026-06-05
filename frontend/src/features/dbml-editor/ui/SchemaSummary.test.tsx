import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SchemaSummary } from './SchemaSummary'
import type { DbmlSchema } from '@/entities/dbml'

const schema = {
  tables: [
    { name: 'users', schema: 'public', columns: [] },
    { name: 'posts', schema: 'public', columns: [] },
  ],
  refs: [
    {
      fromTable: 'posts',
      fromColumns: ['user_id'],
      toTable: 'users',
      toColumns: ['id'],
      relation: 'n-1',
    },
  ],
  enums: [{ name: 'role', values: [{ name: 'admin' }, { name: 'user' }] }],
  tableGroups: [{ name: 'core', tables: ['users', 'posts'] }],
  notes: [],
} as unknown as DbmlSchema

describe('SchemaSummary', () => {
  it('shows a placeholder when there is no schema', () => {
    render(<SchemaSummary schema={undefined} />)
    expect(screen.getByText(/no parsed schema/i)).toBeInTheDocument()
  })

  it('shows counts and table names for a parsed schema', () => {
    render(<SchemaSummary schema={schema} />)

    expect(screen.getByTestId('summary-tables')).toHaveTextContent('2')
    expect(screen.getByTestId('summary-refs')).toHaveTextContent('1')
    expect(screen.getByTestId('summary-enums')).toHaveTextContent('1')
    expect(screen.getByTestId('summary-groups')).toHaveTextContent('1')
    expect(screen.getByTestId('summary-notes')).toHaveTextContent('0')

    expect(screen.getByText('users')).toBeInTheDocument()
    expect(screen.getByText('posts')).toBeInTheDocument()
  })
})
