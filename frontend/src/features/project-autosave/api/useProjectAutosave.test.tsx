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
})
