import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { GroupSection } from './GroupSection'
import type { DisplayGroup } from '@/entities/erd'

const usersTable = {
  id: 'public.users', name: 'users', schema: 'public',
  columns: [{ id: 'public.users.id', name: 'id', type: 'integer', pk: true, notNull: true, unique: false, increment: false, isFk: false }],
}
const group: DisplayGroup = {
  key: 'auth', label: 'auth', color: '#1570EF', tables: [usersTable],
}
const handlers = {
  onCreateGroup: vi.fn(), onRenameGroup: vi.fn(), onDeleteGroup: vi.fn(),
  onSetGroupColor: vi.fn(), onMoveTable: vi.fn(),
}
const base = {
  group, groupNames: ['auth', 'content'], selected: null,
  onSelect: () => {}, collapsed: false, onToggleCollapse: vi.fn(),
  groupOps: handlers, mutationsEnabled: true,
}

const setup = () =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GroupSection — collapse', () => {
  it('shows rows when expanded, hides them when collapsed', () => {
    const { rerender } = render(<GroupSection {...base} />)
    expect(screen.getByTestId('tablelist-row-users')).toBeTruthy()
    rerender(<GroupSection {...base} collapsed={true} />)
    expect(screen.queryByTestId('tablelist-row-users')).toBeNull()
  })

  it('clicking the toggle calls onToggleCollapse', () => {
    render(<GroupSection {...base} />)
    fireEvent.click(screen.getByTestId('group-toggle-auth'))
    expect(base.onToggleCollapse).toHaveBeenCalled()
  })

  it('Ungrouped section renders no group menu', () => {
    const ungrouped: DisplayGroup = { ...group, key: '__ungrouped', label: 'Ungrouped' }
    render(<GroupSection {...base} group={ungrouped} />)
    expect(screen.queryByTestId('group-menu-__ungrouped')).toBeNull()
  })
})

describe('GroupSection — group menu', () => {
  it('clicking a color swatch calls onSetGroupColor with the hex', async () => {
    const user = setup()
    render(<GroupSection {...base} />)
    await user.click(screen.getByTestId('group-menu-auth'))
    const swatch = await screen.findByTestId('swatch-#EA4A8B')
    await user.click(swatch)
    expect(handlers.onSetGroupColor).toHaveBeenCalledWith('auth', '#EA4A8B')
  })

  it('Default color calls onSetGroupColor(name, null)', async () => {
    const user = setup()
    render(<GroupSection {...base} />)
    await user.click(screen.getByTestId('group-menu-auth'))
    await user.click(await screen.findByText('Default color'))
    expect(handlers.onSetGroupColor).toHaveBeenCalledWith('auth', null)
  })

  it('Delete calls onDeleteGroup', async () => {
    const user = setup()
    render(<GroupSection {...base} />)
    await user.click(screen.getByTestId('group-menu-auth'))
    await user.click(await screen.findByText('Delete'))
    expect(handlers.onDeleteGroup).toHaveBeenCalledWith('auth')
  })

  it('Rename switches the label to an input; Enter commits', async () => {
    const user = setup()
    render(<GroupSection {...base} />)
    await user.click(screen.getByTestId('group-menu-auth'))
    await user.click(await screen.findByText('Rename'))
    const input = screen.getByTestId('group-rename-input')
    fireEvent.change(input, { target: { value: 'identity' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(handlers.onRenameGroup).toHaveBeenCalledWith('auth', 'identity')
  })

  it('menu trigger is disabled while mutations are disabled', () => {
    render(<GroupSection {...base} mutationsEnabled={false} />)
    expect((screen.getByTestId('group-menu-auth') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('GroupSection — move menu', () => {
  it('lists other groups + Ungrouped; clicking calls onMoveTable', async () => {
    const user = setup()
    render(<GroupSection {...base} />)
    await user.click(screen.getByTestId('table-move-users'))
    await user.click(await screen.findByText('content'))
    expect(handlers.onMoveTable).toHaveBeenCalledWith('public.users', 'content')
  })

  it('Ungrouped target passes null', async () => {
    const user = setup()
    render(<GroupSection {...base} />)
    await user.click(screen.getByTestId('table-move-users'))
    await user.click(await screen.findByText('Ungrouped'))
    expect(handlers.onMoveTable).toHaveBeenCalledWith('public.users', null)
  })

  it('keydown Enter on the move trigger does not bubble to the row onSelect', () => {
    const onSelect = vi.fn()
    render(<GroupSection {...base} onSelect={onSelect} />)
    fireEvent.keyDown(screen.getByTestId('table-move-users'), { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('a table already in Ungrouped gets no Ungrouped item', async () => {
    const user = setup()
    const ungrouped: DisplayGroup = { ...group, key: '__ungrouped', label: 'Ungrouped' }
    render(<GroupSection {...base} group={ungrouped} />)
    await user.click(screen.getByTestId('table-move-users'))
    await screen.findByText('auth') // 메뉴 열림 대기
    expect(screen.queryByText('Move to')).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Ungrouped' })).toBeNull()
  })
})
