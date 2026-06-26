import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TableSearch } from './TableSearch'
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
  refs: [],
  enums: [],
  tableGroups: [],
  notes: [],
}

describe('TableSearch', () => {
  it('shows only tables matching the query in the dropdown', () => {
    render(<TableSearch schema={baseSchema} onNavigate={() => {}} />)
    fireEvent.change(screen.getByTestId('table-search-input'), { target: { value: 'post' } })
    expect(screen.getByTestId('table-search-result-posts')).toBeTruthy()
    expect(screen.queryByTestId('table-search-result-users')).toBeNull()
  })

  it('matches by column name and shows a hint on the result', () => {
    render(<TableSearch schema={baseSchema} onNavigate={() => {}} />)
    fireEvent.change(screen.getByTestId('table-search-input'), { target: { value: 'email' } })
    expect(screen.getByTestId('table-search-result-users')).toBeTruthy()
    expect(screen.queryByTestId('table-search-result-posts')).toBeNull()
    expect(screen.getByTestId('table-search-hint-users').textContent).toBe('컬럼: email')
  })

  it('Enter navigates to the top match with its matched column ids', () => {
    const onNavigate = vi.fn()
    render(<TableSearch schema={baseSchema} onNavigate={onNavigate} />)
    const input = screen.getByTestId('table-search-input')
    fireEvent.change(input, { target: { value: 'email' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onNavigate).toHaveBeenCalledWith('public.users', ['public.users.email'])
  })

  it('clicking a result navigates', () => {
    const onNavigate = vi.fn()
    render(<TableSearch schema={baseSchema} onNavigate={onNavigate} />)
    fireEvent.change(screen.getByTestId('table-search-input'), { target: { value: 'post' } })
    fireEvent.mouseDown(screen.getByTestId('table-search-result-posts'))
    expect(onNavigate).toHaveBeenCalledWith('public.posts', [])
  })

  it('ArrowDown moves the cursor so Enter picks the next match', () => {
    const onNavigate = vi.fn()
    render(<TableSearch schema={baseSchema} onNavigate={onNavigate} />)
    const input = screen.getByTestId('table-search-input')
    // "id" matches both users and posts (both have an id column).
    fireEvent.change(input, { target: { value: 'id' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Declaration order: users first, posts second.
    expect(onNavigate).toHaveBeenCalledWith('public.posts', ['public.posts.id'])
  })

  it('navigating clears the query and closes the dropdown', () => {
    const onNavigate = vi.fn()
    render(<TableSearch schema={baseSchema} onNavigate={onNavigate} />)
    const input = screen.getByTestId('table-search-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'post' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input.value).toBe('')
    expect(screen.queryByTestId('table-search-results')).toBeNull()
  })

  it('the clear button empties the query and closes the dropdown', () => {
    render(<TableSearch schema={baseSchema} onNavigate={() => {}} />)
    const input = screen.getByTestId('table-search-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'post' } })
    fireEvent.click(screen.getByTestId('table-search-clear'))
    expect(input.value).toBe('')
    expect(screen.queryByTestId('table-search-results')).toBeNull()
  })

  it('shows a no-results message when nothing matches', () => {
    render(<TableSearch schema={baseSchema} onNavigate={() => {}} />)
    fireEvent.change(screen.getByTestId('table-search-input'), { target: { value: 'zzz_nope' } })
    expect(screen.getByText('검색 결과 없음')).toBeTruthy()
  })

  it('"/" focuses the search input when focus is not in a field', () => {
    render(<TableSearch schema={baseSchema} onNavigate={() => {}} />)
    const input = screen.getByTestId('table-search-input')
    expect(input).not.toBe(document.activeElement)
    fireEvent.keyDown(window, { key: '/' })
    expect(input).toBe(document.activeElement)
  })
})
