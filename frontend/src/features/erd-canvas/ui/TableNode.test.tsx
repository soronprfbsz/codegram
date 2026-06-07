import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { TableNode, type TableNodeProps } from './TableNode'

function renderNode(props: TableNodeProps) {
  return render(
    <ReactFlowProvider>
      <TableNode {...props} />
    </ReactFlowProvider>,
  )
}

const baseProps = {
  id: 'public.users',
  type: 'table',
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
  width: 220,
  height: 120,
} as const

describe('TableNode', () => {
  it('renders the table name in the header', () => {
    renderNode({
      ...baseProps,
      data: {
        tableName: 'users',
        tableId: 'public.users',
        headerColor: '#3498db',
        columns: [
          {
            id: 'public.users.id',
            name: 'id',
            type: 'integer',
            pk: true,
            fk: false,
            nn: true,
            unique: false,
          },
        ],
      },
    } as TableNodeProps)
    expect(screen.getByText('users')).toBeInTheDocument()
  })

  it('renders one row per column with name, type and markers', () => {
    renderNode({
      ...baseProps,
      data: {
        tableName: 'users',
        tableId: 'public.users',
        columns: [
          {
            id: 'public.users.id',
            name: 'id',
            type: 'integer',
            pk: true,
            fk: false,
            nn: true,
            unique: false,
          },
          {
            id: 'public.users.org_id',
            name: 'org_id',
            type: 'integer',
            pk: false,
            fk: true,
            nn: false,
            unique: true,
          },
        ],
      },
    } as TableNodeProps)

    expect(screen.getByText('id')).toBeInTheDocument()
    expect(screen.getByText('org_id')).toBeInTheDocument()
    expect(screen.getAllByText('integer')).toHaveLength(2)
    // PK + NN markers on the first row, FK + UQ markers on the second.
    expect(screen.getByTestId('marker-pk-public.users.id')).toBeInTheDocument()
    expect(screen.getByTestId('marker-nn-public.users.id')).toBeInTheDocument()
    expect(
      screen.getByTestId('marker-fk-public.users.org_id'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('marker-uq-public.users.org_id'),
    ).toBeInTheDocument()
  })

  it('renders a left + right handle per column keyed by the column id', () => {
    const { container } = renderNode({
      ...baseProps,
      data: {
        tableName: 'users',
        tableId: 'public.users',
        columns: [
          {
            id: 'public.users.id',
            name: 'id',
            type: 'integer',
            pk: true,
            fk: false,
            nn: true,
            unique: false,
          },
        ],
      },
    } as TableNodeProps)

    // React Flow renders each <Handle> as a div.react-flow__handle.
    const handles = container.querySelectorAll('.react-flow__handle')
    expect(handles).toHaveLength(2)
    // Both handles carry the column id as their data-handleid.
    const ids = Array.from(handles).map((h) =>
      h.getAttribute('data-handleid'),
    )
    expect(ids).toEqual(['public.users.id', 'public.users.id'])
  })
})
