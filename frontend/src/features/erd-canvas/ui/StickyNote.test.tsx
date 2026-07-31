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

  it('carries the note scale as an inline custom property', () => {
    const { container } = renderNode({
      ...baseProps,
      data: { title: 'Onboarding', content: 'text', scale: 1.8 },
    } as StickyNoteProps)
    const card = container.querySelector<HTMLElement>(
      '[data-testid="sticky-note-note:Onboarding"]',
    )!
    expect(card.style.getPropertyValue('--note-scale')).toBe('1.8')
  })

  it('defaults to scale 1 when the note has none', () => {
    const { container } = renderNode({
      ...baseProps,
      data: { title: 'Onboarding', content: 'text' },
    } as StickyNoteProps)
    const card = container.querySelector<HTMLElement>(
      '[data-testid="sticky-note-note:Onboarding"]',
    )!
    expect(card.style.getPropertyValue('--note-scale')).toBe('1')
  })

  it('clamps a corrupt stored scale into range', () => {
    const { container } = renderNode({
      ...baseProps,
      data: { title: 'Onboarding', content: 'text', scale: 99 },
    } as StickyNoteProps)
    const card = container.querySelector<HTMLElement>(
      '[data-testid="sticky-note-note:Onboarding"]',
    )!
    expect(card.style.getPropertyValue('--note-scale')).toBe('3')
  })

  it('derives every dimension from the scale (no raw px in the card)', () => {
    const { container } = renderNode({
      ...baseProps,
      data: { title: 'Onboarding', content: 'text', scale: 2 },
    } as StickyNoteProps)
    const card = container.querySelector<HTMLElement>(
      '[data-testid="sticky-note-note:Onboarding"]',
    )!
    expect(card.style.fontSize).toContain('var(--note-scale)')
    expect(card.style.minWidth).toContain('var(--erd-note-min-w)')
    expect(card.style.maxWidth).toContain('var(--erd-note-max-w)')
  })

  it('pins the line-height tokens on the card and its header (Tailwind text-xs/text-sm removal fix)', () => {
    const { container, getByText } = renderNode({
      ...baseProps,
      data: { title: 'Onboarding', content: 'text' },
    } as StickyNoteProps)
    const card = container.querySelector<HTMLElement>(
      '[data-testid="sticky-note-note:Onboarding"]',
    )!
    const header = getByText('Onboarding')
    expect(card.style.lineHeight).toBe('var(--erd-note-lh-body)')
    expect(header.style.lineHeight).toBe('var(--erd-note-lh-head)')
  })
})
