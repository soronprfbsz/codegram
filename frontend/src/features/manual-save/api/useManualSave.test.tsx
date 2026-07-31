import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

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
