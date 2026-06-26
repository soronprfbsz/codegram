import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { ManageGroupsDialog } from './ManageGroupsDialog'
import type { DbmlSchema } from '@/entities/dbml'
import type { GroupOpHandlers } from '../model/types'

const SCHEMA: DbmlSchema = {
  tables: [
    { id: 'public.users', name: 'users', schema: 'public', columns: [] },
    { id: 'public.posts', name: 'posts', schema: 'public', columns: [] },
    { id: 'public.logs', name: 'logs', schema: 'public', columns: [] },
  ],
  refs: [],
  enums: [],
  tableGroups: [{ name: 'CORE', color: '#3B82F6', tables: ['public.users'] }],
  notes: [],
}

function makeOps(): GroupOpHandlers {
  return {
    onCreateGroup: vi.fn(),
    onRenameGroup: vi.fn(),
    onDeleteGroup: vi.fn(),
    onSetGroupColor: vi.fn(),
    onMoveTable: vi.fn(),
    onMoveTables: vi.fn(),
    onMoveTablesToNewGroup: vi.fn(),
  }
}

const user = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

function renderDialog(ops: GroupOpHandlers) {
  render(<ManageGroupsDialog open onOpenChange={() => {}} schema={SCHEMA} groupOps={ops} />)
}

describe('ManageGroupsDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters the table list by name', () => {
    renderDialog(makeOps())
    expect(screen.getByTestId('mg-row-users')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('mg-filter'), { target: { value: 'pos' } })
    expect(screen.getByTestId('mg-row-posts')).toBeInTheDocument()
    expect(screen.queryByTestId('mg-row-users')).toBeNull()
    expect(screen.queryByTestId('mg-row-logs')).toBeNull()
  })

  it('bulk-moves the selected tables into a chosen group', async () => {
    const ops = makeOps()
    renderDialog(ops)
    fireEvent.click(screen.getByLabelText('posts 선택'))
    fireEvent.click(screen.getByLabelText('logs 선택'))
    await user().click(screen.getByTestId('mg-move-trigger'))
    fireEvent.click(await screen.findByTestId('mg-move-to-CORE'))
    expect(ops.onMoveTables).toHaveBeenCalledWith(['public.posts', 'public.logs'], 'CORE')
  })

  it('moves to Ungrouped (null)', async () => {
    const ops = makeOps()
    renderDialog(ops)
    fireEvent.click(screen.getByLabelText('users 선택'))
    await user().click(screen.getByTestId('mg-move-trigger'))
    fireEvent.click(await screen.findByTestId('mg-move-ungrouped'))
    expect(ops.onMoveTables).toHaveBeenCalledWith(['public.users'], null)
  })

  it('select-all then move applies to every visible table', async () => {
    const ops = makeOps()
    renderDialog(ops)
    fireEvent.click(screen.getByTestId('mg-select-all'))
    await user().click(screen.getByTestId('mg-move-trigger'))
    fireEvent.click(await screen.findByTestId('mg-move-ungrouped'))
    expect(ops.onMoveTables).toHaveBeenCalledWith(
      ['public.users', 'public.posts', 'public.logs'],
      null,
    )
  })

  it('group filter: 미분류 shows only ungrouped tables', async () => {
    renderDialog(makeOps())
    await user().click(screen.getByTestId('mg-groupfilter-trigger'))
    fireEvent.click(await screen.findByTestId('mg-groupfilter-ungrouped'))
    expect(screen.getByTestId('mg-row-posts')).toBeInTheDocument()
    expect(screen.getByTestId('mg-row-logs')).toBeInTheDocument()
    expect(screen.queryByTestId('mg-row-users')).toBeNull() // users ∈ CORE
  })

  it('group filter: a specific group shows only its tables', async () => {
    renderDialog(makeOps())
    await user().click(screen.getByTestId('mg-groupfilter-trigger'))
    fireEvent.click(await screen.findByTestId('mg-groupfilter-CORE'))
    expect(screen.getByTestId('mg-row-users')).toBeInTheDocument()
    expect(screen.queryByTestId('mg-row-posts')).toBeNull()
    expect(screen.queryByTestId('mg-row-logs')).toBeNull()
  })

  it('group filter + text filter combine (AND)', async () => {
    renderDialog(makeOps())
    await user().click(screen.getByTestId('mg-groupfilter-trigger'))
    fireEvent.click(await screen.findByTestId('mg-groupfilter-ungrouped'))
    fireEvent.change(screen.getByTestId('mg-filter'), { target: { value: 'pos' } })
    expect(screen.getByTestId('mg-row-posts')).toBeInTheDocument()
    expect(screen.queryByTestId('mg-row-logs')).toBeNull()
    expect(screen.queryByTestId('mg-row-users')).toBeNull()
  })

  it('creates a new group and moves the selection into it', async () => {
    const ops = makeOps()
    renderDialog(ops)
    fireEvent.click(screen.getByLabelText('posts 선택'))
    await user().click(screen.getByTestId('mg-move-trigger'))
    fireEvent.click(await screen.findByTestId('mg-move-new'))
    fireEvent.change(screen.getByTestId('mg-newgroup-input'), { target: { value: 'billing' } })
    fireEvent.click(screen.getByTestId('mg-newgroup-confirm'))
    expect(ops.onMoveTablesToNewGroup).toHaveBeenCalledWith(['public.posts'], 'billing')
  })
})
