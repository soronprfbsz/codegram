import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { GroupNode, type GroupNodeProps } from './GroupNode'

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
})
