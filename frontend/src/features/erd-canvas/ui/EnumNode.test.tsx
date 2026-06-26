import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { EnumNode, type EnumNodeProps } from './EnumNode'

function renderNode(props: EnumNodeProps) {
  return render(
    <ReactFlowProvider>
      <EnumNode {...props} />
    </ReactFlowProvider>,
  )
}

const baseProps = {
  id: 'enum:public.user_role',
  type: 'enum',
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
  width: 160,
  height: 80,
} as const

describe('EnumNode', () => {
  it('renders the enum name and each value', () => {
    renderNode({
      ...baseProps,
      data: { enumName: 'user_role', values: ['admin', 'member', 'guest'] },
    } as EnumNodeProps)

    expect(screen.getByText('user_role')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('member')).toBeInTheDocument()
    expect(screen.getByText('guest')).toBeInTheDocument()
  })

  it('renders left + right target handles so the enum-link can flip its anchor side', () => {
    const { container } = renderNode({
      ...baseProps,
      data: { enumName: 'user_role', values: ['admin'] },
    } as EnumNodeProps)
    // Default `in` (left) + alternate `in@right` (right), mirroring table columns.
    expect(container.querySelectorAll('.react-flow__handle')).toHaveLength(2)
  })
})
