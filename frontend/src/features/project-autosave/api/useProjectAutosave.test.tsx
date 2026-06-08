import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const mutateMock = vi.fn()

vi.mock('@/entities/project', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/project')>()
  return {
    ...actual,
    useUpdateProject: () => ({
      mutate: mutateMock,
    }),
  }
})

import { useProjectAutosave } from './useProjectAutosave'

describe('useProjectAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mutateMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does NOT save on mount', () => {
    renderHook(() =>
      useProjectAutosave({ projectId: 'p-1', dbmlText: 'initial' }),
    )

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('saves the edited dbml_text after the debounce window', () => {
    const { rerender } = renderHook(
      ({ text }: { text: string }) =>
        useProjectAutosave({ projectId: 'p-1', dbmlText: text }),
      { initialProps: { text: 'initial' } },
    )

    rerender({ text: 'edited' })
    expect(mutateMock).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const [payload] = mutateMock.mock.calls[0]
    expect(payload).toEqual({ dbml_text: 'edited', layout: undefined })
  })

  it('reports saving then saved across the mutation lifecycle', async () => {
    // Drive the mutation callbacks manually to assert the status transitions.
    mutateMock.mockImplementation((_payload, opts) => {
      opts.onSuccess()
    })

    const { result, rerender } = renderHook(
      ({ text }: { text: string }) =>
        useProjectAutosave({ projectId: 'p-1', dbmlText: text }),
      { initialProps: { text: 'initial' } },
    )

    expect(result.current.status).toBe('idle')

    rerender({ text: 'edited' })
    act(() => {
      vi.advanceTimersByTime(600)
    })

    await waitFor(() => expect(result.current.status).toBe('saved'))
  })

  it('does NOT save when the editor seeds dbmlText to the server baseline', () => {
    // Mimic the editor: mount empty, then a seed effect sets both dbmlText and
    // baseline to the loaded project's value. That seed must not autosave.
    const { rerender } = renderHook(
      ({ text, baseline }: { text: string; baseline: string }) =>
        useProjectAutosave({ projectId: 'p-1', dbmlText: text, baseline }),
      { initialProps: { text: '', baseline: '' } },
    )

    // The server seed: dbmlText becomes the loaded value, baseline matches it.
    rerender({ text: 'table users {}', baseline: 'table users {}' })
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('saves a real edit (dbmlText diverges from the baseline)', () => {
    const { rerender } = renderHook(
      ({ text, baseline }: { text: string; baseline: string }) =>
        useProjectAutosave({ projectId: 'p-1', dbmlText: text, baseline }),
      { initialProps: { text: '', baseline: '' } },
    )

    // Seed first (no save), then a genuine user edit (diverges from baseline).
    rerender({ text: 'seeded', baseline: 'seeded' })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(mutateMock).not.toHaveBeenCalled()

    rerender({ text: 'seeded + edit', baseline: 'seeded' })
    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const [payload] = mutateMock.mock.calls[0]
    expect(payload).toEqual({ dbml_text: 'seeded + edit', layout: undefined })
  })

  it('re-seeds on a project switch without saving the old or new value', () => {
    const { rerender } = renderHook(
      ({
        projectId,
        text,
        baseline,
      }: {
        projectId: string
        text: string
        baseline: string
      }) => useProjectAutosave({ projectId, dbmlText: text, baseline }),
      { initialProps: { projectId: 'p-1', text: 'a-text', baseline: 'a-text' } },
    )

    // Switch to project B (the editor re-seeds dbmlText + baseline together).
    rerender({ projectId: 'p-2', text: 'b-text', baseline: 'b-text' })
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // No save for the switch itself (neither the old nor the new seed value).
    expect(mutateMock).not.toHaveBeenCalled()

    // A real edit on the new project still saves the new project's value.
    rerender({ projectId: 'p-2', text: 'b-text edited', baseline: 'b-text' })
    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const [payload] = mutateMock.mock.calls[0]
    expect(payload).toEqual({ dbml_text: 'b-text edited', layout: undefined })
  })

  it('saves on a layout-only change (dbmlText unchanged) when layout diverges from its baseline', () => {
    const seed = { version: 1, positions: { 'public.users': { x: 0, y: 0 } } }
    const moved = { version: 1, positions: { 'public.users': { x: 320, y: 80 } } }

    const { rerender } = renderHook(
      ({ layout }: { layout: Record<string, unknown> }) =>
        useProjectAutosave({
          projectId: 'p-1',
          dbmlText: 'table users {}',
          baseline: 'table users {}', // dbml is at baseline (no text edit)
          layout,
          layoutBaseline: seed,
        }),
      { initialProps: { layout: seed } },
    )

    // Seed render: layout === layoutBaseline, dbml === baseline -> no save.
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(mutateMock).not.toHaveBeenCalled()

    // A drag changes only the layout; dbmlText still equals the baseline.
    rerender({ layout: moved })
    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const [payload] = mutateMock.mock.calls[0]
    expect(payload).toEqual({ dbml_text: 'table users {}', layout: moved })
  })

  it('does NOT save when layout is re-seeded equal to its baseline (project re-seed)', () => {
    const seed = { version: 1, positions: { 'public.users': { x: 10, y: 10 } } }
    // A NEW object with identical content (mimics a query-cache update on reload).
    const reseed = JSON.parse(JSON.stringify(seed)) as Record<string, unknown>

    const { rerender } = renderHook(
      ({ layout }: { layout: Record<string, unknown> }) =>
        useProjectAutosave({
          projectId: 'p-1',
          dbmlText: 'table users {}',
          baseline: 'table users {}',
          layout,
          layoutBaseline: seed,
        }),
      { initialProps: { layout: seed } },
    )

    rerender({ layout: reseed }) // new identity, SAME serialized value
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('does NOT loop when layoutBaseline is omitted but a new-identity layout object arrives', () => {
    // No layoutBaseline => layout changes must NOT trigger a save on their own
    // (only dbml edits do); guards against an inline-object infinite save loop.
    const { rerender } = renderHook(
      ({ layout }: { layout: Record<string, unknown> }) =>
        useProjectAutosave({
          projectId: 'p-1',
          dbmlText: 'seeded',
          baseline: 'seeded',
          layout,
        }),
      { initialProps: { layout: { version: 1, positions: {} } } },
    )

    // New object identity each rerender, no dbml edit, no layoutBaseline.
    rerender({ layout: { version: 1, positions: {} } })
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(mutateMock).not.toHaveBeenCalled()
  })
})
