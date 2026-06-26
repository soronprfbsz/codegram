import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { NodeSelectionInfo, EdgeSelectionInfo } from '@/entities/erd'
import { SelectionCard } from './SelectionCard'

// SelectionInfo 멤버 타입으로 주석해 테스트 경계에서 타입 드리프트를 잡는다.
const nodeInfo: NodeSelectionInfo = {
  kind: 'node' as const,
  nodeId: 'public.users',
  nodeType: 'table' as const,
  label: 'users',
  x: 320,
  y: 80,
}
const edgeInfo: EdgeSelectionInfo = {
  kind: 'edge' as const,
  edgeId: 'public.posts.(user_id)>public.users.(id)#0',
  label: 'posts.user_id → users.id',
  manual: true,
  waypoints: [{ x: 50, y: 0 }, { x: 50, y: 100 }],
}

describe('SelectionCard — node', () => {
  it('shows editable x/y and commits a numeric edit on Enter', async () => {
    const onEditNodePosition = vi.fn()
    const user = userEvent.setup()
    render(
      <SelectionCard
        info={nodeInfo}
        onEditNodePosition={onEditNodePosition}
        onEditEdgeWaypoint={vi.fn()}
        onResetEdgePath={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('users')).toBeInTheDocument()
    const x = screen.getByTestId('sel-x')
    expect(x).toHaveValue('320')
    await user.clear(x)
    await user.type(x, '600{Enter}')
    expect(onEditNodePosition).toHaveBeenCalledWith('public.users', { x: 600, y: 80 })
  })

  it('blank input reverts on Enter instead of committing 0', async () => {
    const onEditNodePosition = vi.fn()
    const user = userEvent.setup()
    render(
      <SelectionCard
        info={nodeInfo}
        onEditNodePosition={onEditNodePosition}
        onEditEdgeWaypoint={vi.fn()}
        onResetEdgePath={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const x = screen.getByTestId('sel-x')
    await user.clear(x)
    await user.type(x, '{Enter}')
    expect(onEditNodePosition).not.toHaveBeenCalled()
    expect(x).toHaveValue('320')
  })

  it('non-numeric input reverts on Enter', async () => {
    const onEditNodePosition = vi.fn()
    const user = userEvent.setup()
    render(
      <SelectionCard
        info={nodeInfo}
        onEditNodePosition={onEditNodePosition}
        onEditEdgeWaypoint={vi.fn()}
        onResetEdgePath={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const x = screen.getByTestId('sel-x')
    await user.clear(x)
    await user.type(x, '12abc{Enter}')
    expect(onEditNodePosition).not.toHaveBeenCalled()
    expect(x).toHaveValue('320')
  })

  it('X 버튼 클릭이 onClose를 호출한다', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <SelectionCard
        info={nodeInfo}
        onEditNodePosition={vi.fn()}
        onEditEdgeWaypoint={vi.fn()}
        onResetEdgePath={vi.fn()}
        onClose={onClose}
      />,
    )
    await user.click(screen.getByTestId('selection-card-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('SelectionCard — edge', () => {
  it('lists waypoints and commits a single-axis edit', async () => {
    const onEditEdgeWaypoint = vi.fn()
    const user = userEvent.setup()
    render(
      <SelectionCard
        info={edgeInfo}
        onEditNodePosition={vi.fn()}
        onEditEdgeWaypoint={onEditEdgeWaypoint}
        onResetEdgePath={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('posts.user_id → users.id')).toBeInTheDocument()
    expect(screen.getByText('수동')).toBeInTheDocument()
    const wp0x = screen.getByTestId('wp-0-x')
    expect(wp0x).toHaveValue('50')
    await user.clear(wp0x)
    await user.type(wp0x, '70{Enter}')
    expect(onEditEdgeWaypoint).toHaveBeenCalledWith(edgeInfo.edgeId, 0, 'x', 70)
  })

  it('shows Reset line for manual paths and fires the callback', async () => {
    const onResetEdgePath = vi.fn()
    const user = userEvent.setup()
    render(
      <SelectionCard
        info={edgeInfo}
        onEditNodePosition={vi.fn()}
        onEditEdgeWaypoint={vi.fn()}
        onResetEdgePath={onResetEdgePath}
        onClose={vi.fn()}
      />,
    )
    await user.click(screen.getByTestId('edge-reset-panel'))
    expect(onResetEdgePath).toHaveBeenCalledWith(edgeInfo.edgeId)
  })

  it('hides Reset line for auto paths', () => {
    render(
      <SelectionCard
        info={{ ...edgeInfo, manual: false }}
        onEditNodePosition={vi.fn()}
        onEditEdgeWaypoint={vi.fn()}
        onResetEdgePath={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('edge-reset-panel')).toBeNull()
    expect(screen.getByText('자동')).toBeInTheDocument()
  })

  it('shows "No bends" when the edge has no interior waypoints', () => {
    render(
      <SelectionCard
        info={{ ...edgeInfo, waypoints: [] }}
        onEditNodePosition={vi.fn()}
        onEditEdgeWaypoint={vi.fn()}
        onResetEdgePath={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('꺾임 없음')).toBeInTheDocument()
  })
})
