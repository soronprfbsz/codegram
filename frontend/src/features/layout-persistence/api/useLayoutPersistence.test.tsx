import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useLayoutPersistence } from './useLayoutPersistence'

describe('useLayoutPersistence', () => {
  it('seeds positions + baseline from project.layout.positions keyed on projectId', () => {
    const layout = {
      version: 1,
      positions: { 'public.users': { x: 10, y: 20 } },
    }
    const { result } = renderHook(() =>
      useLayoutPersistence({ projectId: 'p-1', projectLayout: layout }),
    )
    expect(result.current.positions).toEqual({ 'public.users': { x: 10, y: 20 } })
    expect(result.current.layout).toEqual({
      version: 1,
      positions: { 'public.users': { x: 10, y: 20 } },
      edges: {},
    })
    expect(result.current.layoutBaseline).toEqual({
      version: 1,
      positions: { 'public.users': { x: 10, y: 20 } },
      edges: {},
    })
  })

  it('treats a missing/empty/legacy project.layout as no positions', () => {
    const { result } = renderHook(() =>
      useLayoutPersistence({ projectId: 'p-1', projectLayout: {} }),
    )
    expect(result.current.positions).toEqual({})
    expect(result.current.layout).toEqual({ version: 1, positions: {}, edges: {} })
  })

  it('keeps the layout object referentially stable across re-renders until positions change', () => {
    const layout = { version: 1, positions: {} }
    const { result, rerender } = renderHook(
      ({ pid }: { pid: string }) =>
        useLayoutPersistence({ projectId: pid, projectLayout: layout }),
      { initialProps: { pid: 'p-1' } },
    )
    const first = result.current.layout
    rerender({ pid: 'p-1' }) // same project, no position change
    expect(result.current.layout).toBe(first) // SAME identity (no save loop)
  })

  it('setPositions updates positions + the derived layout (new identity)', () => {
    const { result } = renderHook(() =>
      useLayoutPersistence({ projectId: 'p-1', projectLayout: {} }),
    )
    const before = result.current.layout
    act(() => {
      result.current.setPositions({ 'public.users': { x: 5, y: 5 } })
    })
    expect(result.current.positions).toEqual({ 'public.users': { x: 5, y: 5 } })
    expect(result.current.layout).not.toBe(before)
    expect(result.current.layout.positions).toEqual({
      'public.users': { x: 5, y: 5 },
    })
    // Baseline stays at the seeded (empty) value so a drag DIVERGES from it.
    expect(result.current.layoutBaseline).toEqual({ version: 1, positions: {}, edges: {} })
  })

  it('re-seeds positions when projectId changes', () => {
    let pid = 'p-1'
    let projectLayout: Record<string, unknown> = {
      version: 1,
      positions: { 'public.a': { x: 1, y: 1 } },
    }
    const { result, rerender } = renderHook(() =>
      useLayoutPersistence({ projectId: pid, projectLayout }),
    )
    expect(result.current.positions).toEqual({ 'public.a': { x: 1, y: 1 } })
    pid = 'p-2'
    projectLayout = { version: 1, positions: { 'public.b': { x: 2, y: 2 } } }
    rerender()
    expect(result.current.positions).toEqual({ 'public.b': { x: 2, y: 2 } })
  })


  it('seeds positions on the loading -> loaded transition (id arrives after first render)', () => {
    // PRODUCTION timing: useProject returns isLoading/data=undefined first,
    // so the FIRST render has projectId=undefined + projectLayout=undefined
    // (lazy initializer captures {}). When the project loads, projectId goes
    // undefined -> 'p-1' and the seed effect MUST fire and restore positions.
    // Keying the seed on the URL param (always 'p-1') would miss this and is
    // the bug this test guards against.
    let projectId: string | undefined = undefined
    let projectLayout: Record<string, unknown> | undefined = undefined
    const { result, rerender } = renderHook(() =>
      useLayoutPersistence({ projectId, projectLayout }),
    )
    // While loading: no positions seeded yet.
    expect(result.current.positions).toEqual({})

    // Project loads.
    projectId = 'p-1'
    projectLayout = { version: 1, positions: { 'public.users': { x: 7, y: 9 } } }
    rerender()

    // The undefined -> 'p-1' transition fired the seed effect.
    expect(result.current.positions).toEqual({ 'public.users': { x: 7, y: 9 } })
    expect(result.current.layoutBaseline).toEqual({
      version: 1,
      positions: { 'public.users': { x: 7, y: 9 } },
      edges: {},
    })
  })
})

const edgeSeededLayout = {
  version: 1,
  positions: { 'public.users': { x: 10, y: 20 } },
  edges: { 'public.posts.(user_id)>public.users.(id)#0': { waypoints: [{ x: 50, y: 0 }] } },
}

describe('useLayoutPersistence — edge paths', () => {
  it('seeds edgePaths from project.layout.edges when the project loads', () => {
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useLayoutPersistence>[0]) =>
        useLayoutPersistence(props),
      { initialProps: { projectId: undefined, projectLayout: undefined } },
    )
    expect(result.current.edgePaths).toEqual({})

    rerender({ projectId: 'p1', projectLayout: edgeSeededLayout })
    expect(result.current.edgePaths).toEqual(edgeSeededLayout.edges)
    expect(result.current.layout.edges).toEqual(edgeSeededLayout.edges)
    expect(result.current.layoutBaseline.edges).toEqual(edgeSeededLayout.edges)
  })

  it('setEdgePaths updates layout (and not the baseline)', () => {
    const { result } = renderHook(() =>
      useLayoutPersistence({ projectId: 'p1', projectLayout: { version: 1, positions: {} } }),
    )
    act(() => {
      result.current.setEdgePaths({ 'e#0': { waypoints: [{ x: 1, y: 2 }] } })
    })
    expect(result.current.layout.edges).toEqual({ 'e#0': { waypoints: [{ x: 1, y: 2 }] } })
    expect(result.current.layoutBaseline.edges).toEqual({})
  })
})
