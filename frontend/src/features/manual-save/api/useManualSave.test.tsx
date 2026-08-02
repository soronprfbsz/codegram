import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ApiError } from '@/shared/api/client'

const mutateAsyncMock = vi.fn(() => Promise.resolve({}))
const successMock = vi.fn()
const errorMock = vi.fn()
const infoMock = vi.fn()

vi.mock('@/entities/snapshot', () => ({
  useCreateSnapshot: () => ({ mutateAsync: mutateAsyncMock }),
}))
vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ success: successMock, error: errorMock, info: infoMock }),
}))

import { useManualSave } from './useManualSave'

function press(key = 's', init: KeyboardEventInit = {}) {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key, ctrlKey: true, cancelable: true, ...init }),
  )
}

describe('useManualSave', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset()
    mutateAsyncMock.mockResolvedValue({})
    successMock.mockReset()
    errorMock.mockReset()
    infoMock.mockReset()
  })

  it('saves BEFORE snapshotting — the snapshot copies server state', async () => {
    const order: string[] = []
    const flush = vi.fn(async () => {
      order.push('flush')
    })
    mutateAsyncMock.mockImplementation(async () => {
      order.push('snapshot')
      return {}
    })

    const { result } = renderHook(() =>
      useManualSave({ projectId: 'p-1', canEdit: true, editable: true, flush }),
    )
    await act(async () => {
      await result.current.save()
    })

    expect(order).toEqual(['flush', 'snapshot'])
    expect(mutateAsyncMock).toHaveBeenCalledWith({ kind: 'checkpoint' })
    expect(successMock).toHaveBeenCalled()
  })

  it('records nothing and explains why when not in edit mode', async () => {
    const flush = vi.fn(async () => {})
    const { result } = renderHook(() =>
      useManualSave({ projectId: 'p-1', canEdit: true, editable: false, flush }),
    )
    await act(async () => {
      await result.current.save()
    })

    expect(flush).not.toHaveBeenCalled()
    expect(mutateAsyncMock).not.toHaveBeenCalled()
    expect(infoMock).toHaveBeenCalled()
  })

  it('reports a failed save', async () => {
    const flush = vi.fn(async () => {
      throw new Error('network down')
    })
    const { result } = renderHook(() =>
      useManualSave({ projectId: 'p-1', canEdit: true, editable: true, flush }),
    )
    await act(async () => {
      await result.current.save()
    })

    expect(errorMock).toHaveBeenCalled()
    expect(successMock).not.toHaveBeenCalled()
  })

  it('suppresses the toast on a 409 — autosave already raises the conflict dialog', async () => {
    const flush = vi.fn(async () => {
      throw new ApiError('conflict', 409)
    })
    const { result } = renderHook(() =>
      useManualSave({ projectId: 'p-1', canEdit: true, editable: true, flush }),
    )
    await act(async () => {
      await result.current.save()
    })

    expect(errorMock).not.toHaveBeenCalled()
    expect(successMock).not.toHaveBeenCalled()
  })

  it('ignores a second press while a save is in flight (no duplicate checkpoint)', async () => {
    // A controllable gate: flush stays pending until the test releases it, so
    // the second save() genuinely lands while the first is still in flight —
    // not just "after it happened to finish".
    let releaseFlush: () => void = () => {}
    const flushGate = new Promise<void>((resolve) => {
      releaseFlush = resolve
    })
    const flush = vi.fn(() => flushGate)

    const { result } = renderHook(() =>
      useManualSave({ projectId: 'p-1', canEdit: true, editable: true, flush }),
    )

    await act(async () => {
      const save = result.current.save
      const first = save()
      const second = save()
      releaseFlush()
      await Promise.all([first, second])
    })

    expect(flush).toHaveBeenCalledTimes(1)
    expect(mutateAsyncMock).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+S saves and blocks the browser save dialog', async () => {
    const flush = vi.fn(async () => {})
    renderHook(() =>
      useManualSave({ projectId: 'p-1', canEdit: true, editable: true, flush }),
    )

    let prevented = false
    const spy = (e: Event) => {
      prevented = e.defaultPrevented
    }
    window.addEventListener('keydown', spy)
    await act(async () => {
      press()
      await Promise.resolve()
    })
    window.removeEventListener('keydown', spy)

    expect(prevented).toBe(true)
    expect(flush).toHaveBeenCalled()
  })

  it('does not listen for a viewer', async () => {
    const flush = vi.fn(async () => {})
    renderHook(() =>
      useManualSave({ projectId: 'p-1', canEdit: false, editable: false, flush }),
    )

    await act(async () => {
      press()
      await Promise.resolve()
    })

    expect(flush).not.toHaveBeenCalled()
    expect(infoMock).not.toHaveBeenCalled()
  })
})
