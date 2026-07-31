import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { StoredLayout } from '@/entities/layout'

const mutateAsyncMock = vi.fn((_payload: Record<string, unknown>) => Promise.resolve({}))

vi.mock('@/entities/project', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/project')>()
  return {
    ...actual,
    useUpdateProject: () => ({
      mutateAsync: mutateAsyncMock,
    }),
  }
})

import { useProjectAutosave } from './useProjectAutosave'

describe('useProjectAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mutateAsyncMock.mockReset()
    mutateAsyncMock.mockResolvedValue({})
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
    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })

  it('saves the edited dbml_text after the debounce window', async () => {
    const { rerender } = renderHook(
      ({ text }: { text: string }) =>
        useProjectAutosave({ projectId: 'p-1', dbmlText: text }),
      { initialProps: { text: 'initial' } },
    )

    rerender({ text: 'edited' })
    expect(mutateAsyncMock).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    const [payload] = mutateAsyncMock.mock.calls[0]
    expect(payload).toEqual({ dbml_text: 'edited', layout: undefined })
  })

  it('reports saving then saved across the mutation lifecycle', async () => {
    mutateAsyncMock.mockResolvedValue({})

    const { result, rerender } = renderHook(
      ({ text }: { text: string }) =>
        useProjectAutosave({ projectId: 'p-1', dbmlText: text }),
      { initialProps: { text: 'initial' } },
    )

    expect(result.current.status).toBe('idle')

    rerender({ text: 'edited' })
    await act(async () => {
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

    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })

  it('saves a real edit (dbmlText diverges from the baseline)', async () => {
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
    expect(mutateAsyncMock).not.toHaveBeenCalled()

    rerender({ text: 'seeded + edit', baseline: 'seeded' })
    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    const [payload] = mutateAsyncMock.mock.calls[0]
    expect(payload).toEqual({ dbml_text: 'seeded + edit', layout: undefined })
  })

  it('re-seeds on a project switch without saving the old or new value', async () => {
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
    expect(mutateAsyncMock).not.toHaveBeenCalled()

    // A real edit on the new project still saves the new project's value.
    rerender({ projectId: 'p-2', text: 'b-text edited', baseline: 'b-text' })
    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    const [payload] = mutateAsyncMock.mock.calls[0]
    expect(payload).toEqual({ dbml_text: 'b-text edited', layout: undefined })
  })

  it('saves on a layout-only change (dbmlText unchanged) when layout diverges from its baseline', async () => {
    const seed: StoredLayout = { version: 1, positions: { 'public.users': { x: 0, y: 0 } } }
    const moved: StoredLayout = { version: 1, positions: { 'public.users': { x: 320, y: 80 } } }

    const { rerender } = renderHook(
      ({ layout }: { layout: StoredLayout }) =>
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
    expect(mutateAsyncMock).not.toHaveBeenCalled()

    // A drag changes only the layout; dbmlText still equals the baseline.
    rerender({ layout: moved })
    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    const [payload] = mutateAsyncMock.mock.calls[0]
    expect(payload).toEqual({ dbml_text: 'table users {}', layout: moved })
  })

  it('does NOT save when layout is re-seeded equal to its baseline (project re-seed)', () => {
    const seed: StoredLayout = { version: 1, positions: { 'public.users': { x: 10, y: 10 } } }
    // A NEW object with identical content (mimics a query-cache update on reload).
    const reseed = JSON.parse(JSON.stringify(seed)) as StoredLayout

    const { rerender } = renderHook(
      ({ layout }: { layout: StoredLayout }) =>
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

    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })

  it('does NOT loop when layoutBaseline is omitted but a new-identity layout object arrives', () => {
    // No layoutBaseline => layout changes must NOT trigger a save on their own
    // (only dbml edits do); guards against an inline-object infinite save loop.
    const { rerender } = renderHook(
      ({ layout }: { layout: StoredLayout }) =>
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

    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })
})

describe('useProjectAutosave.flush', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mutateAsyncMock.mockReset()
    mutateAsyncMock.mockResolvedValue({})
  })
  afterEach(() => vi.useRealTimers())

  it('sends a pending save immediately instead of waiting out the debounce', async () => {
    const { result, rerender } = renderHook(
      ({ text }: { text: string }) =>
        useProjectAutosave({ projectId: 'p-1', dbmlText: text, baseline: 'initial' }),
      { initialProps: { text: 'initial' } },
    )

    rerender({ text: 'edited' })
    expect(mutateAsyncMock).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.flush()
    })

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    expect(mutateAsyncMock.mock.calls[0][0]).toMatchObject({ dbml_text: 'edited' })
  })

  it('resolves without sending anything when there is nothing pending', async () => {
    const { result } = renderHook(() =>
      useProjectAutosave({ projectId: 'p-1', dbmlText: 'initial', baseline: 'initial' }),
    )

    await act(async () => {
      await result.current.flush()
    })

    expect(mutateAsyncMock).not.toHaveBeenCalled()
  })

  it('re-sends the PATCH on a flush after a failed save (the retry actually retries)', async () => {
    // ADR-0027: a failed flush keeps the user in edit mode so they can try
    // again. Trying again has to reach the server — not re-await the promise
    // that already rejected, which reports the same failure and sends nothing.
    mutateAsyncMock.mockRejectedValueOnce(new Error('network down'))

    const { result, rerender } = renderHook(
      ({ text }: { text: string }) =>
        useProjectAutosave({ projectId: 'p-1', dbmlText: text, baseline: 'initial' }),
      { initialProps: { text: 'initial' } },
    )

    rerender({ text: 'edited' })
    await expect(
      act(async () => {
        await result.current.flush()
      }),
    ).rejects.toThrow('network down')
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)

    // Same content, no new keystroke: the user just presses Ctrl+S / 읽기 again.
    await act(async () => {
      await result.current.flush()
    })

    expect(mutateAsyncMock).toHaveBeenCalledTimes(2)
    expect(mutateAsyncMock.mock.calls[1][0]).toMatchObject({ dbml_text: 'edited' })
    await waitFor(() => expect(result.current.status).toBe('saved'))
  })

  it('sends content whose debounce was cancelled while suspended (nothing is pending)', async () => {
    // The snapshot preview suspends autosave, which cancels the pending save.
    // Leaving edit mode then flushes with no timer armed — the edit is still
    // only in the browser, so the flush must send it.
    const { result, rerender } = renderHook(
      ({ text, suspended }: { text: string; suspended: boolean }) =>
        useProjectAutosave({
          projectId: 'p-1',
          dbmlText: text,
          baseline: 'initial',
          suspended,
        }),
      { initialProps: { text: 'initial', suspended: false } },
    )

    rerender({ text: 'edited', suspended: false })
    rerender({ text: 'edited', suspended: true }) // preview opens → cancel()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(mutateAsyncMock).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.flush()
    })

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
    expect(mutateAsyncMock.mock.calls[0][0]).toMatchObject({ dbml_text: 'edited' })
  })

  it('does NOT send again once the edit has landed (no debounce, nothing owed)', async () => {
    const { result, rerender } = renderHook(
      ({ text }: { text: string }) =>
        useProjectAutosave({ projectId: 'p-1', dbmlText: text, baseline: 'initial' }),
      { initialProps: { text: 'initial' } },
    )

    rerender({ text: 'edited' })
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)

    // The debounce is spent and the content is exactly what landed.
    await act(async () => {
      await result.current.flush()
    })

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
  })

  it('rejects when the save fails, so the caller can refuse to leave edit mode', async () => {
    mutateAsyncMock.mockRejectedValue(new Error('network down'))

    const { result, rerender } = renderHook(
      ({ text }: { text: string }) =>
        useProjectAutosave({ projectId: 'p-1', dbmlText: text, baseline: 'initial' }),
      { initialProps: { text: 'initial' } },
    )

    rerender({ text: 'edited' })

    await expect(
      act(async () => {
        await result.current.flush()
      }),
    ).rejects.toThrow('network down')
  })
})
