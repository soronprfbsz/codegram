import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ReactFlowProvider, Position } from '@xyflow/react'
import {
  RelationEdge,
  startMarkerKind,
  endMarkerKind,
  type RelationEdgeProps,
} from './RelationEdge'

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
