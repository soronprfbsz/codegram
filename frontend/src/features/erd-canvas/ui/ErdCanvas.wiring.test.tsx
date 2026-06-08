import * as React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErdCanvas } from './ErdCanvas'
import { schema } from './ErdCanvas.fixture'

// `schema` is the two-table fixture (`public.users` + `public.posts` with a
// relation) extracted into ErdCanvas.fixture.ts so this file
// and ErdCanvas.test.tsx share ONE source of truth and node ids match.

// Mock the React Flow runtime so we can drive onNodeDragStop without a real
// DOM drag (jsdom has no DOMMatrix / viewport transform). The mock captures
// the props ErdCanvasInner passes AND renders its children so descendant
// <Panel>/<Button> (Task 11) mount. (Mocks hoist to the top of the file.)
const fitViewMock = vi.fn()
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...actual,
    ReactFlow: (props: { children?: React.ReactNode } & Record<string, unknown>) => {
      ;(globalThis as Record<string, unknown>).__rfProps = props
      return <div data-testid="rf-mock">{props.children}</div>
    },
    Panel: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="rf-panel">{children}</div>
    ),
    useReactFlow: () => ({ fitView: fitViewMock }),
  }
})

describe('ErdCanvas drag-stop persistence', () => {
  it('lifts a StoredLayout via onLayoutChange when a node drag stops', async () => {
    const onLayoutChange = vi.fn()
    render(
      <ErdCanvas
        schema={schema}
        savedPositions={{ 'public.users': { x: 320, y: 80 } }}
        onLayoutChange={onLayoutChange}
      />,
    )

    // The mocked ReactFlow stored the props; read its wired handlers + nodes.
    const props = (globalThis as Record<string, unknown>).__rfProps as {
      nodes: Array<{ id: string; type?: string }>
      onNodeDragStop: () => void
    }
    // Group nodes (none here) would be non-draggable; tables are draggable.
    expect(props.nodes.some((n) => n.id === 'public.users')).toBe(true)

    // Fire drag-stop the way React Flow would.
    props.onNodeDragStop()

    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    const lifted = onLayoutChange.mock.calls[0][0] as {
      version: number
      positions: Record<string, { x: number; y: number }>
    }
    expect(lifted.version).toBe(1)
    expect(lifted.positions['public.users']).toBeDefined()
  })
})

describe('ErdCanvas Auto-arrange', () => {
  it('renders an accessible Auto-arrange button that re-emits a recomputed layout', async () => {
    const user = userEvent.setup()
    const onLayoutChange = vi.fn()
    // Seed an off-dagre saved position so the auto-arranged result differs.
    render(
      <ErdCanvas
        schema={schema}
        savedPositions={{ 'public.users': { x: 999, y: 999 } }}
        onLayoutChange={onLayoutChange}
      />,
    )

    const button = screen.getByRole('button', { name: /auto-arrange/i })
    expect(button).toBeInTheDocument()

    await user.click(button)

    // Emitted a fresh layout (positions derived from dagre, not the saved 999).
    expect(onLayoutChange).toHaveBeenCalled()
    const emitted = onLayoutChange.mock.calls.at(-1)?.[0] as {
      version: number
      positions: Record<string, { x: number; y: number }>
    }
    expect(emitted.version).toBe(1)
    expect(emitted.positions['public.users']).toBeDefined()
    expect(emitted.positions['public.users']).not.toEqual({ x: 999, y: 999 })
  })
})
