import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useEffect } from 'react'
import { ReactFlowProvider, Position, useStoreApi } from '@xyflow/react'
import {
  RelationEdge,
  startMarkerKind,
  endMarkerKind,
  buildObstacles,
  GROUP_CLEARANCE,
  type RelationEdgeProps,
  type ObstacleNode,
} from './RelationEdge'
import { EdgePathContext } from '../lib/edgePathContext'
import * as routeLib from '../lib/routeOrthogonal'

describe('orthoPoints route cache (survives virtualization remount)', () => {
  it('reuses the cached route on remount with unchanged geometry, recomputes when it changes', () => {
    const spy = vi.spyOn(routeLib, 'routeOrthogonal')
    const props = {
      ...baseProps,
      id: 'route-cache-probe',
      sourceX: 5,
      sourceY: 5,
      targetX: 220,
      targetY: 140,
    } as RelationEdgeProps

    // First mount computes + caches the route.
    renderEdge(props).unmount()

    // Remount with identical geometry → cache hit, A* MUST NOT run again
    // (this is the pan/zoom remount churn that was re-routing every frame).
    spy.mockClear()
    renderEdge(props).unmount()
    expect(spy).not.toHaveBeenCalled()

    // Changed geometry → signature misses → A* recomputes.
    spy.mockClear()
    renderEdge({ ...props, sourceX: 999 }).unmount()
    expect(spy).toHaveBeenCalled()

    spy.mockRestore()
  })
})

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
    // mirrored many glyph, inset 5px from the card: prongs at x=6, apex at x=15.
    expect(start.querySelector('path')!.getAttribute('d')).toBe(
      'M6 2 L15 8 L6 14 M15 8 L6 8',
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

  it('an enum link is editable: selected + manual path shows segment handles + reset, but NO swap (no crow-foot)', () => {
    const { container } = renderEdge({
      ...baseProps,
      id: 'enumlink:public.users.role',
      data: {
        relation: 'n-1',
        sourceMarker: 'many',
        targetMarker: 'one',
        isEnumLink: true,
        isEdgeSelected: true,
        waypoints: [
          { x: 50, y: 0 },
          { x: 50, y: 100 },
        ],
      },
    } as RelationEdgeProps)

    // Same editing affordances as a relation edge: segment drag handles appear.
    expect(container.querySelector('[data-testid="edge-handles"]')).toBeTruthy()
    expect(container.querySelector('[data-testid^="edge-seg-"]')).toBeTruthy()
    // ...while staying a dashed type-association with NO crow-foot markers.
    expect(container.querySelector('marker[id^="crowfoot-"]')).toBeNull()
    expect((container.querySelector('path.react-flow__edge-path') as SVGPathElement).style.strokeDasharray).not.toBe('')
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
    setEdgeSide: vi.fn(),
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

  it('segment drag handles use the hand (pointer) cursor', () => {
    // 요구사항: 선을 움직일 수 있는 포인트에서만 hand 커서 — 핸들 자체는 pointer.
    const ctx = makeCtx()
    renderSelectedEdge(ctx)
    const seg = screen.getByTestId('edge-seg-1') as unknown as SVGCircleElement
    expect(seg.style.cursor).toBe('pointer')
  })

  it('flow overlay + halo render only while the edge is selected', () => {
    const ctx = makeCtx()
    const { container, unmount } = renderSelectedEdge(ctx)
    const flow = container.querySelector('[data-testid="edge-flow"]')!
    expect(flow).toBeTruthy()
    expect(flow.classList.contains('erd-edge-flow')).toBe(true)
    unmount()

    const { container: plain } = renderEdge({
      ...baseProps,
      data: { relation: '1-n', sourceMarker: 'one', targetMarker: 'many' },
    } as RelationEdgeProps)
    expect(plain.querySelector('[data-testid="edge-flow"]')).toBeNull()
  })

  it('renders draggable endpoint handles and NO swap buttons (flip is by drag now)', () => {
    const ctx = makeCtx()
    const { container } = renderSelectedEdge(ctx)
    // Both endpoints are present and grabbable (drag toward a node side to flip).
    const src = container.querySelector('[data-testid="edge-endpoint-source"]') as SVGCircleElement
    const tgt = container.querySelector('[data-testid="edge-endpoint-target"]') as SVGCircleElement
    expect(src).toBeTruthy()
    expect(tgt).toBeTruthy()
    expect(src.style.cursor).toBe('grab')
    // The old click-to-flip buttons are gone.
    expect(container.querySelector('[data-testid="edge-swap-source"]')).toBeNull()
    expect(container.querySelector('[data-testid="edge-swap-target"]')).toBeNull()
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

describe('buildObstacles', () => {
  const rect = (x: number) => ({ x, y: 0, width: 100, height: 60 })
  // Non-endpoint group rects are inflated by GROUP_CLEARANCE (corridors keep a
  // gap from the box); cards are NOT inflated.
  const grp = (x: number) => ({
    x: x - GROUP_CLEARANCE,
    y: 0 - GROUP_CLEARANCE,
    width: 100 + 2 * GROUP_CLEARANCE,
    height: 60 + 2 * GROUP_CLEARANCE,
  })
  const nodes: ObstacleNode[] = [
    { id: 't1', type: 'table', parentId: 'gA', rect: rect(0) },
    { id: 't2', type: 'table', parentId: 'gB', rect: rect(500) },
    { id: 't3', type: 'table', parentId: 'gC', rect: rect(1000) }, // 중간/무관 그룹 멤버
    { id: 'gA', type: 'group', rect: rect(-10) },
    { id: 'gB', type: 'group', rect: rect(490) },
    { id: 'gC', type: 'group', rect: rect(990) },
  ]

  it('always includes all table/enum/sticky cards (uninflated)', () => {
    const obs = buildObstacles(nodes, 't1', 't2')
    expect(obs).toContainEqual(rect(0))
    expect(obs).toContainEqual(rect(500))
    expect(obs).toContainEqual(rect(1000))
  })

  it('excludes the source and target groups, includes other groups (inflated)', () => {
    const obs = buildObstacles(nodes, 't1', 't2') // src group gA, tgt group gB
    expect(obs).not.toContainEqual(rect(-10)) // gA excluded
    expect(obs).not.toContainEqual(grp(-10))  // gA excluded (inflated form too)
    expect(obs).not.toContainEqual(rect(490)) // gB excluded
    expect(obs).toContainEqual(grp(990))      // gC included, inflated by clearance
  })

  it('includes all groups when neither endpoint is grouped', () => {
    const ungrouped: ObstacleNode[] = [
      { id: 'u1', type: 'table', rect: rect(0) },
      { id: 'u2', type: 'table', rect: rect(500) },
      { id: 'gC', type: 'group', rect: rect(990) },
    ]
    const obs = buildObstacles(ungrouped, 'u1', 'u2')
    expect(obs).toContainEqual(grp(990))
  })

  it('treats an intra-group edge as having no group obstacle for its own group', () => {
    const obs = buildObstacles(nodes, 't1', 't1') // 같은 그룹 gA
    expect(obs).not.toContainEqual(grp(-10)) // gA 제외
    expect(obs).toContainEqual(grp(490))     // gB 포함(inflated)
    expect(obs).toContainEqual(grp(990))     // gC 포함(inflated)
  })
})
