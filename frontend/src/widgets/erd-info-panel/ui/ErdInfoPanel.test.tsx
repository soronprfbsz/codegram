import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErdInfoPanel } from './ErdInfoPanel'
import type { DbmlSchema } from '@/entities/dbml'

const baseSchema: DbmlSchema = {
  tables: [
    {
      id: 'public.users',
      name: 'users',
      schema: 'public',
      columns: [
        { id: 'public.users.id', name: 'id', type: 'integer', pk: true, notNull: true, unique: false, increment: false, isFk: false },
        { id: 'public.users.email', name: 'email', type: 'varchar', pk: false, notNull: true, unique: true, increment: false, isFk: false },
      ],
    },
    {
      id: 'public.posts',
      name: 'posts',
      schema: 'public',
      columns: [
        { id: 'public.posts.id', name: 'id', type: 'integer', pk: true, notNull: true, unique: false, increment: false, isFk: false },
      ],
    },
  ],
  refs: [
    {
      id: 'ref1',
      fromTable: 'posts',
      fromSchema: 'public',
      fromColumns: ['user_id'],
      toTable: 'users',
      toSchema: 'public',
      toColumns: ['id'],
      relation: 'n-1',
    },
  ],
  enums: [
    { name: 'status', schema: 'public', values: [{ name: 'active' }, { name: 'inactive' }] },
  ],
  tableGroups: [
    { name: 'core', tables: ['public.users'], color: undefined, note: undefined },
  ],
  notes: [
    { name: 'note1', content: 'A note' },
  ],
}

describe('ErdInfoPanel — schema summary stats', () => {
  it('renders stat values from a schema', () => {
    render(
      <ErdInfoPanel schema={baseSchema} selected={null} onSelect={() => {}} />,
    )
    expect(screen.getByTestId('stat-tables').textContent).toBe('2')
    expect(screen.getByTestId('stat-refs').textContent).toBe('1')
    expect(screen.getByTestId('stat-table-groups').textContent).toBe('1')
    expect(screen.getByTestId('stat-enums').textContent).toBe('1')
    expect(screen.getByTestId('stat-notes').textContent).toBe('1')
  })

  it('shows dialect prop when provided', () => {
    render(
      <ErdInfoPanel
        schema={baseSchema}
        selected={null}
        onSelect={() => {}}
        dialect="MySQL 8.0"
      />,
    )
    expect(screen.getByTestId('stat-dialect').textContent).toBe('MySQL 8.0')
  })

  it('shows — when dialect is undefined', () => {
    render(
      <ErdInfoPanel schema={baseSchema} selected={null} onSelect={() => {}} />,
    )
    expect(screen.getByTestId('stat-dialect').textContent).toBe('—')
  })

  it('renders zeros gracefully when schema is undefined', () => {
    render(
      <ErdInfoPanel schema={undefined} selected={null} onSelect={() => {}} />,
    )
    expect(screen.getByTestId('stat-tables').textContent).toBe('0')
    expect(screen.getByTestId('stat-refs').textContent).toBe('0')
  })
})

describe('ErdInfoPanel — table list rendering', () => {
  it('renders a data-testid row for each table', () => {
    render(
      <ErdInfoPanel schema={baseSchema} selected={null} onSelect={() => {}} />,
    )
    expect(screen.getByTestId('tablelist-row-users')).toBeInTheDocument()
    expect(screen.getByTestId('tablelist-row-posts')).toBeInTheDocument()
  })

  it('groups tables under section labels from deriveDisplayGroups', () => {
    render(
      <ErdInfoPanel schema={baseSchema} selected={null} onSelect={() => {}} />,
    )
    // 'core' group label should be visible (uppercase in DOM but text matches case-insensitively)
    expect(screen.getByText(/core/i)).toBeInTheDocument()
    // ungrouped label for posts
    expect(screen.getByText(/ungrouped/i)).toBeInTheDocument()
  })

  it('shows field count for each row', () => {
    render(
      <ErdInfoPanel schema={baseSchema} selected={null} onSelect={() => {}} />,
    )
    // users has 2 columns; the users row should contain "2"
    const usersRow = screen.getByTestId('tablelist-row-users')
    expect(usersRow.textContent).toContain('2')
    // posts has 1 column
    const postsRow = screen.getByTestId('tablelist-row-posts')
    expect(postsRow.textContent).toContain('1')
  })
})

describe('ErdInfoPanel — selection', () => {
  it('clicking a row calls onSelect with the table name', () => {
    const onSelect = vi.fn()
    render(
      <ErdInfoPanel schema={baseSchema} selected={null} onSelect={onSelect} />,
    )
    fireEvent.click(screen.getByTestId('tablelist-row-users'))
    expect(onSelect).toHaveBeenCalledWith('users')
  })

  it('pressing Enter on a row calls onSelect', () => {
    const onSelect = vi.fn()
    render(
      <ErdInfoPanel schema={baseSchema} selected={null} onSelect={onSelect} />,
    )
    fireEvent.keyDown(screen.getByTestId('tablelist-row-posts'), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('posts')
  })

  it('pressing Space on a row calls onSelect', () => {
    const onSelect = vi.fn()
    render(
      <ErdInfoPanel schema={baseSchema} selected={null} onSelect={onSelect} />,
    )
    fireEvent.keyDown(screen.getByTestId('tablelist-row-posts'), { key: ' ' })
    expect(onSelect).toHaveBeenCalledWith('posts')
  })

  it('selected row gets the selected background class/style', () => {
    render(
      <ErdInfoPanel schema={baseSchema} selected="users" onSelect={() => {}} />,
    )
    const row = screen.getByTestId('tablelist-row-users')
    // The selected row has either the class or inline style for accent-soft bg.
    const hasClass = row.classList.contains('tlist-item-selected')
    const hasStyle = row.style.background === 'var(--erd-accent-soft)'
    expect(hasClass || hasStyle).toBe(true)
  })

  it('non-selected row does not get the selected class', () => {
    render(
      <ErdInfoPanel schema={baseSchema} selected="users" onSelect={() => {}} />,
    )
    const row = screen.getByTestId('tablelist-row-posts')
    expect(row.classList.contains('tlist-item-selected')).toBe(false)
    expect(row.style.background).not.toBe('var(--erd-accent-soft)')
  })
})

describe('ErdInfoPanel — accessibility', () => {
  it('table rows have role=button', () => {
    render(
      <ErdInfoPanel schema={baseSchema} selected={null} onSelect={() => {}} />,
    )
    const row = screen.getByTestId('tablelist-row-users')
    expect(row).toHaveAttribute('role', 'button')
  })

  it('table rows are keyboard-focusable (tabIndex=0)', () => {
    render(
      <ErdInfoPanel schema={baseSchema} selected={null} onSelect={() => {}} />,
    )
    const row = screen.getByTestId('tablelist-row-users')
    expect(row).toHaveAttribute('tabindex', '0')
  })
})
