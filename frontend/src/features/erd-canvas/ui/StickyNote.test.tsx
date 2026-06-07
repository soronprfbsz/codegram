import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { StickyNote, type StickyNoteProps } from './StickyNote'

function renderNode(props: StickyNoteProps) {
  return render(
    <ReactFlowProvider>
      <StickyNote {...props} />
    </ReactFlowProvider>,
  )
}

const baseProps = {
  id: 'note:Onboarding',
  type: 'sticky',
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
  width: 200,
  height: 80,
} as const

describe('StickyNote', () => {
  it('renders the note title and content', () => {
    renderNode({
      ...baseProps,
      data: {
        title: 'Onboarding',
        content: 'Run the seed script before first login.',
      },
    } as StickyNoteProps)

    expect(screen.getByText('Onboarding')).toBeInTheDocument()
    expect(
      screen.getByText('Run the seed script before first login.'),
    ).toBeInTheDocument()
  })

  it('renders no connection handles', () => {
    const { container } = renderNode({
      ...baseProps,
      data: { title: 'Onboarding', content: 'text' },
    } as StickyNoteProps)
    expect(container.querySelectorAll('.react-flow__handle')).toHaveLength(0)
  })
})
