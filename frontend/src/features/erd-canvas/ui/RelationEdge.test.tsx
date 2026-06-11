import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useEffect } from 'react'
import { ReactFlowProvider, Position, useStoreApi } from '@xyflow/react'
import {
  RelationEdge,
  startMarkerKind,
  endMarkerKind,
  type RelationEdgeProps,
} from './RelationEdge'
import { EdgePathContext } from '../lib/edgePathContext'

describe('relation -> crow-foot marker mapping', () => {
  it('maps each relation half to the correct endpoint marker', () => {
    // from half drives the start (source) marker; to half drives the end.
    expect(startMarkerKind('1-1')).toBe('one')
    expect(endMarkerKind('1-1')).toBe('one')

    expect(startMarkerKind('1-n')).toBe('one')
    expect(endMarkerKind('1-n')).toBe('many')

    expect(startMarkerKind('n-1')).toBe('many')
    expect(endMarkerKind('n-1')).toBe('one')

    expect(startMarkerKind('n-n')).toBe('many')
    expect(endMarkerKind('n-n')).toBe('many')
  })
})

function renderEdge(props: RelationEdgeProps) {
  return render(
    <ReactFlowProvider>
      <svg>
        <RelationEdge {...props} />
      </svg>
    </ReactFlowProvider>,
  )
}

const baseProps = {
  id: 'e1',
  source: 'public.posts',
  target: 'public.users',
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 100,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  selected: false,
  animated: false,
  deletable: false,
  selectable: false,
  sourceHandleId: 'public.posts.user_id',
  targetHandleId: 'public.users.id',
} as const

describe('RelationEdge', () => {
  it('renders an edge path and crow-foot marker defs for a 1-n relation', () => {
    const { container } = renderEdge({
      ...baseProps,
      data: { relation: '1-n', sourceMarker: 'one', targetMarker: 'many' },
    } as RelationEdgeProps)

    // BaseEdge renders the path with the react-flow__edge-path class.
    expect(
      container.querySelector('path.react-flow__edge-path'),
    ).toBeTruthy()
    // Two endpoint markers are defined for this edge id.
    expect(container.querySelector('marker#crowfoot-start-e1')).toBeTruthy()
    expect(container.querySelector('marker#crowfoot-end-e1')).toBeTruthy()
  })

  it('orients the start (source, table RIGHT edge) marker WITHOUT auto-start-reverse', () => {
    // Regression: with the same path + refX=15 + orient="auto-start-reverse",
    // the source-side foot rendered mirrored/inside-out. The fix mirrors the
    // glyph into the path (refX=1, orient="auto") so the foot hugs the table
    // edge with the apex on the line — symmetric with the end marker.
    const { container } = renderEdge({
      ...baseProps,
      data: { relation: 'n-1', sourceMarker: 'many', targetMarker: 'one' },
    } as RelationEdgeProps)

    const start = container.querySelector('marker#crowfoot-start-e1')!
    expect(start.getAttribute('orient')).toBe('auto')
    expect(start.getAttribute('refX')).toBe('1')
    // mirrored many glyph: prongs at x=1 (anchored), apex at x=15.
    expect(start.querySelector('path')!.getAttribute('d')).toBe(
      'M1 2 L15 8 L1 14 M15 8 L1 8',
    )

    const end = container.querySelector('marker#crowfoot-end-e1')!
    expect(end.getAttribute('orient')).toBe('auto')
    expect(end.getAttribute('refX')).toBe('15')
  })

  it('renders an enum-link edge dashed and WITHOUT crow-foot markers', () => {
    const { container } = renderEdge({
      ...baseProps,
      id: 'enumlink:public.users.role',
      data: {
        relation: 'n-1',
        sourceMarker: 'many',
        targetMarker: 'one',
        isEnumLink: true,
      },
    } as RelationEdgeProps)

    // The path still renders...
    const path = container.querySelector('path.react-flow__edge-path')
    expect(path).toBeTruthy()
    // ...but dashed (a type association, not a cardinality relationship).
    expect((path as SVGPathElement).style.strokeDasharray).not.toBe('')
    // ...and with NO crow-foot marker defs (enum links carry no cardinality).
    expect(
      container.querySelector('marker[id^="crowfoot-"]'),
    ).toBeNull()
  })
})

describe('RelationEdge manual path (ADR-0012)', () => {
  // polylineToPath(buildManualPath({0,0},{100,100},[{50,0},{50,100}])):
  // both bridge segments are already aligned, so the path is S → w1 → w2 → T.
  const manualD = 'M 0 0 L 50 0 L 50 100 L 100 100'

  it('renders the stored-waypoint polyline when data.waypoints is present', () => {
    const { container } = renderEdge({
      ...baseProps,
      data: {
        relation: '1-n',
        sourceMarker: 'one',
        targetMarker: 'many',
        waypoints: [
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ],
      },
    } as RelationEdgeProps)

    const path = container.querySelector('path.react-flow__edge-path')!
    expect(path.getAttribute('d')).toBe(manualD)
  })

  it('renders an auto-routed path (NOT the manual polyline) when waypoints are absent', () => {
    const { container } = renderEdge({
      ...baseProps,
      data: { relation: '1-n', sourceMarker: 'one', targetMarker: 'many' },
    } as RelationEdgeProps)

    const d = container
      .querySelector('path.react-flow__edge-path')!
      .getAttribute('d')
    expect(d).toBeTruthy()
    expect(d).not.toBe(manualD)
  })
})

describe('RelationEdge selection handles (Task 5)', () => {
  it('renders segment-drag handles when selected with a manual path', () => {
    const { container } = renderEdge({
      ...baseProps,
      data: {
        relation: '1-n',
        sourceMarker: 'one',
        targetMarker: 'many',
        isEdgeSelected: true,
        waypoints: [
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ],
      },
    } as RelationEdgeProps)

    expect(container.querySelector('[data-testid="edge-handles"]')).toBeTruthy()
    expect(container.querySelector('[data-testid^="edge-seg-"]')).toBeTruthy()
  })

  it('renders NO handles when not selected', () => {
    const { container } = renderEdge({
      ...baseProps,
      data: {
        relation: '1-n',
        sourceMarker: 'one',
        targetMarker: 'many',
        waypoints: [
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ],
      },
    } as RelationEdgeProps)

    expect(container.querySelector('[data-testid="edge-handles"]')).toBeNull()
    expect(container.querySelector('[data-testid^="edge-seg-"]')).toBeNull()
  })
})

// ── Drag-loop interaction (commit / reset / abort) ──────────────────────────

// jsdom (29.x) has no pointer-capture implementation — stub it so
// onPointerDown's setPointerCapture call doesn't throw. (Capture semantics
// are not asserted here; covered by real-browser E2E.)
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = vi.fn()
}

/**
 * EdgeLabelRenderer portals into `domNode.querySelector('.react-flow__
 * edgelabel-renderer')` from the store; a bare ReactFlowProvider has
 * domNode: null, so the Reset button would never mount. This setter injects a
 * minimal domNode so the portal target exists. screenToFlowPosition remains
 * IDENTITY: the global getBoundingClientRect stub puts the dom node at (0,0)
 * and the default transform is [0,0,1], so clientX/Y map 1:1 to flow coords.
 */
function StoreDomNode() {
  const store = useStoreApi()
  useEffect(() => {
    const domNode = document.createElement('div')
    const labelLayer = document.createElement('div')
    labelLayer.className = 'react-flow__edgelabel-renderer'
    domNode.appendChild(labelLayer)
    document.body.appendChild(domNode)
    store.setState({ domNode })
    return () => domNode.remove()
  }, [store])
  return null
}

function makeCtx() {
  return {
    commitWaypoints: vi.fn(),
    resetPath: vi.fn(),
    reportPath: vi.fn(),
  }
}

function renderSelectedEdge(ctx: ReturnType<typeof makeCtx>) {
  const props = {
    ...baseProps,
    data: {
      relation: '1-n',
      sourceMarker: 'one',
      targetMarker: 'many',
      isEdgeSelected: true,
      waypoints: [
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ],
    },
  } as RelationEdgeProps
  return render(
    <ReactFlowProvider>
      <StoreDomNode />
      <EdgePathContext.Provider value={ctx}>
        <svg>
          <RelationEdge {...props} />
        </svg>
      </EdgePathContext.Provider>
    </ReactFlowProvider>,
  )
}

describe('RelationEdge segment drag interaction (Task 5)', () => {
  // Full rendered path: S(0,0) → (50,0) → (50,100) → T(100,100).
  // edge-seg-1 is the VERTICAL middle segment (50,0)-(50,100): dragging it
  // moves x; clientX maps 1:1 to flow x (identity, see StoreDomNode).
  const committedD = 'M 0 0 L 50 0 L 50 100 L 100 100'
  const draggedD = 'M 0 0 L 70 0 L 70 100 L 100 100'

  it('pointer drag on a vertical segment commits the moved waypoints', () => {
    const ctx = makeCtx()
    renderSelectedEdge(ctx)

    const seg = screen.getByTestId('edge-seg-1')
    fireEvent.pointerDown(seg, { pointerId: 1, clientX: 50, clientY: 50 })
    fireEvent.pointerMove(seg, { pointerId: 1, clientX: 70, clientY: 50 })
    fireEvent.pointerUp(seg, { pointerId: 1 })

    expect(ctx.commitWaypoints).toHaveBeenCalledTimes(1)
    expect(ctx.commitWaypoints).toHaveBeenCalledWith('e1', [
      { x: 70, y: 0 },
      { x: 70, y: 100 },
    ])
  })

  it('Reset line button fires resetPath with the edge id', () => {
    const ctx = makeCtx()
    renderSelectedEdge(ctx)
    fireEvent.click(screen.getByTestId('edge-reset'))
    expect(ctx.resetPath).toHaveBeenCalledWith('e1')
  })

  it('pointercancel aborts the drag without committing and reverts the path', () => {
    const ctx = makeCtx()
    const { container } = renderSelectedEdge(ctx)
    const pathD = () =>
      container.querySelector('path.react-flow__edge-path')!.getAttribute('d')

    const seg = screen.getByTestId('edge-seg-1')
    fireEvent.pointerDown(seg, { pointerId: 1, clientX: 50, clientY: 50 })
    fireEvent.pointerMove(seg, { pointerId: 1, clientX: 70, clientY: 50 })
    // The draft renders mid-drag...
    expect(pathD()).toBe(draggedD)

    fireEvent.pointerCancel(seg, { pointerId: 1 })
    // ...but an aborted gesture never commits and the path reverts.
    expect(ctx.commitWaypoints).not.toHaveBeenCalled()
    expect(pathD()).toBe(committedD)
  })
})
