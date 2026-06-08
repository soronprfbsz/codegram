import * as React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ErdCanvas, type ErdCaptureHandle } from './ErdCanvas'

// Minimal schema (one table) so the canvas mounts; inline to avoid coupling
// to a fixture module.
const schema = {
  tables: [
    {
      id: 'public.users',
      schema: 'public',
      name: 'users',
      columns: [{ name: 'id', type: 'int', pk: true }],
    },
  ],
  refs: [],
  enums: [],
  tableGroups: [],
  notes: [],
} as unknown as Parameters<typeof ErdCanvas>[0]['schema']

// Mock the React Flow runtime: render children so the canvas mounts in jsdom,
// and expose an instance with getNodes/getNodesBounds + a fitView spy so the
// capture handle fired by onCaptureReady is fully usable.
const fitViewMock = vi.fn()
const getNodesMock = vi.fn(() => [{ id: 'public.users' }])
const getNodesBoundsMock = vi.fn(() => ({ x: 0, y: 0, width: 400, height: 200 }))
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...actual,
    ReactFlow: (props: { children?: React.ReactNode }) => (
      <div data-testid="rf-mock">{props.children}</div>
    ),
    Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useReactFlow: () => ({
      fitView: fitViewMock,
      getNodes: getNodesMock,
      getNodesBounds: getNodesBoundsMock,
    }),
  }
})

describe('ErdCanvas capture handle', () => {
  it('fires onCaptureReady once with a fitView + getInstance handle', () => {
    const onCaptureReady = vi.fn<(h: ErdCaptureHandle) => void>()

    render(<ErdCanvas schema={schema} onCaptureReady={onCaptureReady} />)

    expect(onCaptureReady).toHaveBeenCalledTimes(1)
    const handle = onCaptureReady.mock.calls[0][0]

    // fitView delegates to the React Flow instance.
    handle.fitView()
    expect(fitViewMock).toHaveBeenCalled()

    // getInstance returns the instance exposing getNodes/getNodesBounds.
    const instance = handle.getInstance()
    expect(instance.getNodes()).toEqual([{ id: 'public.users' }])
    expect(instance.getNodesBounds([])).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 200,
    })
  })
})
