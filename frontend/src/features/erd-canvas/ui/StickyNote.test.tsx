import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { StickyNote, type StickyNoteProps } from './StickyNote'
import { CanvasReadOnlyContext } from '../lib/canvasReadOnly'
import { NoteScaleContext } from '../lib/noteScaleContext'

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

/** jsdom은 레이아웃이 없어 카드 폭이 0이다 — 배율 산식이 폭을 나누므로 고정 폭을 준다. */
function stubCardWidth(width: number) {
  const spy = vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockReturnValue({ width, height: 120, top: 0, left: 0, right: width, bottom: 120, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
  return spy
}

afterEach(() => {
  vi.restoreAllMocks()
})

function renderWithScaleCtx(
  props: StickyNoteProps,
  onNoteScale: (nodeId: string, scale: number, commit: boolean) => void,
  readOnly = false,
) {
  return render(
    <ReactFlowProvider>
      <CanvasReadOnlyContext.Provider value={readOnly}>
        <NoteScaleContext.Provider value={{ onNoteScale }}>
          <StickyNote {...props} />
        </NoteScaleContext.Provider>
      </CanvasReadOnlyContext.Provider>
    </ReactFlowProvider>,
  )
}

const noteProps = {
  ...baseProps,
  data: { title: 'Onboarding', content: 'text' },
} as StickyNoteProps

describe('StickyNote resize handle', () => {
  it('offers a handle on an editable canvas', () => {
    renderWithScaleCtx(noteProps, () => {})
    expect(screen.getByTestId('note-resize-note:Onboarding')).toBeInTheDocument()
  })

  it('renders no handle in read-only mode (ADR-0025)', () => {
    renderWithScaleCtx(noteProps, () => {}, true)
    expect(screen.queryByTestId('note-resize-note:Onboarding')).toBeNull()
  })

  it('previews while dragging and commits on release', () => {
    stubCardWidth(200)
    const calls: Array<[string, number, boolean]> = []
    renderWithScaleCtx(noteProps, (id, scale, commit) => calls.push([id, scale, commit]))
    const handle = screen.getByTestId('note-resize-note:Onboarding')

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 100 })
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 100 })

    // 폭 200px 카드에서 오른쪽으로 100px → 1 * (1 + 100/200) = 1.5
    expect(calls[0]).toEqual(['note:Onboarding', 1.5, false])
    expect(calls[calls.length - 1]).toEqual(['note:Onboarding', 1.5, true])
  })

  it('never goes below the default size when dragged left', () => {
    stubCardWidth(200)
    const calls: Array<[string, number, boolean]> = []
    renderWithScaleCtx(noteProps, (id, scale, commit) => calls.push([id, scale, commit]))
    const handle = screen.getByTestId('note-resize-note:Onboarding')

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: -400 })

    expect(calls[0][1]).toBe(1)
  })

  it('caps at the maximum scale when dragged far right', () => {
    stubCardWidth(200)
    const calls: Array<[string, number, boolean]> = []
    renderWithScaleCtx(noteProps, (id, scale, commit) => calls.push([id, scale, commit]))
    const handle = screen.getByTestId('note-resize-note:Onboarding')

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 5000 })

    expect(calls[0][1]).toBe(3)
  })

  it('resets to the default size on handle double-click', () => {
    const calls: Array<[string, number, boolean]> = []
    renderWithScaleCtx(
      { ...baseProps, data: { title: 'Onboarding', content: 'text', scale: 2.4 } } as StickyNoteProps,
      (id, scale, commit) => calls.push([id, scale, commit]),
    )
    fireEvent.doubleClick(screen.getByTestId('note-resize-note:Onboarding'))
    expect(calls).toEqual([['note:Onboarding', 1, true]])
  })
})
