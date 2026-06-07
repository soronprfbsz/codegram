import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { DbmlSchema } from '@/entities/dbml'
import { ErdCanvas } from './ErdCanvas'

const schema: DbmlSchema = {
  tables: [
    {
      id: 'public.users',
      name: 'users',
      schema: 'public',
      columns: [
        {
          id: 'public.users.id',
          name: 'id',
          type: 'integer',
          pk: true,
          notNull: true,
          unique: false,
          increment: true,
          isFk: false,
        },
      ],
    },
    {
      id: 'public.posts',
      name: 'posts',
      schema: 'public',
      columns: [
        {
          id: 'public.posts.user_id',
          name: 'user_id',
          type: 'integer',
          pk: false,
          notNull: true,
          unique: false,
          increment: false,
          isFk: true,
        },
      ],
    },
  ],
  refs: [
    {
      id: 'public.posts.(user_id)>public.users.(id)',
      fromTable: 'posts',
      fromSchema: 'public',
      fromColumns: ['user_id'],
      toTable: 'users',
      toSchema: 'public',
      toColumns: ['id'],
      relation: 'n-1',
    },
  ],
  enums: [],
  tableGroups: [],
  notes: [],
}

describe('ErdCanvas', () => {
  it('renders a React Flow node per table for a valid schema', async () => {
    const { container } = render(<ErdCanvas schema={schema} />)
    // React Flow renders each node in the `nodes` array as a
    // .react-flow__node element once mounted/measured.
    const nodes = await screen.findAllByText(/users|posts/)
    expect(nodes.length).toBeGreaterThanOrEqual(2)
    // Both table labels are present in the rendered nodes.
    expect(screen.getByText('users')).toBeInTheDocument()
    expect(screen.getByText('posts')).toBeInTheDocument()
    // The canvas root mounted.
    expect(container.querySelector('.react-flow')).toBeInTheDocument()
  })

  it('shows an empty-state placeholder when no schema is provided', () => {
    render(<ErdCanvas schema={undefined} />)
    expect(screen.getByText(/no diagram yet/i)).toBeInTheDocument()
  })
})
