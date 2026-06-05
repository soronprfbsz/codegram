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
})
