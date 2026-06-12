import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { GroupNode, type GroupNodeProps } from './GroupNode'
import { GroupActionContext } from '../lib/groupActionContext'

function renderNode(props: GroupNodeProps) {
  return render(
    <ReactFlowProvider>
      <GroupNode {...props} />
    </ReactFlowProvider>,
  )
}

const baseProps = {
  id: 'group:Sales',
  type: 'group',
  selected: false,
  zIndex: 0,
  isConnectable: false,
  xPos: 0,
  yPos: 0,
  dragging: false,
  draggable: false,
  selectable: false,
  deletable: false,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  width: 600,
  height: 400,
} as const

describe('GroupNode', () => {
  it('renders the group name label', () => {
    renderNode({
      ...baseProps,
      data: { groupName: 'Sales', color: '#ff6b6b' },
    } as GroupNodeProps)
    expect(screen.getByText('Sales')).toBeInTheDocument()
  })

  it('renders a non-interactive region tinted with the group color', () => {
    renderNode({
      ...baseProps,
      data: { groupName: 'Sales', color: '#ff6b6b' },
    } as GroupNodeProps)
    const region = screen.getByTestId('group-region-group:Sales')
    expect(region).toHaveStyle({ pointerEvents: 'none' })
    // The color is applied (rendered as rgb by jsdom).
    expect(region.style.backgroundColor).not.toBe('')
  })

  it('falls back to a neutral tint when no color is set', () => {
    renderNode({
      ...baseProps,
      id: 'group:Misc',
      data: { groupName: 'Misc' },
    } as GroupNodeProps)
    const region = screen.getByTestId('group-region-group:Misc')
    expect(region.style.backgroundColor).not.toBe('')
  })

  it('라벨 크롬은 드래그 핸들 클래스를 갖고, 배경 필은 pointer-events:none', () => {
    const { container } = render(
      <ReactFlowProvider>
        <GroupNode {...({ id: 'group:G', data: { groupName: 'G', color: '#0E9384' } } as never)} />
      </ReactFlowProvider>,
    )
    const fill = container.querySelector('[data-testid="group-region-group:G"]') as HTMLElement
    expect(fill.style.pointerEvents).toBe('none')
    const handle = container.querySelector('.erd-group-handle') as HTMLElement
    expect(handle).toBeTruthy()
    expect(handle.style.pointerEvents).toBe('auto')
  })

  it('정렬 버튼 클릭 시 onArrangeGroup(groupId) 호출', () => {
    const onArrangeGroup = vi.fn()
    const { getByTestId } = render(
      <ReactFlowProvider>
        <GroupActionContext.Provider value={{ onArrangeGroup }}>
          <GroupNode {...({ id: 'group:G', data: { groupName: 'G' } } as never)} />
        </GroupActionContext.Provider>
      </ReactFlowProvider>,
    )
    fireEvent.click(getByTestId('group-arrange-group:G'))
    expect(onArrangeGroup).toHaveBeenCalledWith('group:G')
  })
})
