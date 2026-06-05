import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDebouncedCallback } from './useDebounce'

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does NOT fire the callback on mount', () => {
    const callback = vi.fn()
    renderHook(() => useDebouncedCallback(callback, 600))

    vi.advanceTimersByTime(1000)
    expect(callback).not.toHaveBeenCalled()
  })

  it('fires the callback once after the delay when invoked', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(callback, 600))

    result.current('hello')
    expect(callback).not.toHaveBeenCalled()

    vi.advanceTimersByTime(600)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('hello')
  })

  it('collapses rapid invocations into a single trailing call', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(callback, 600))

    result.current('a')
    vi.advanceTimersByTime(300)
    result.current('b')
    vi.advanceTimersByTime(300)
    result.current('c')

    // Only the final 600ms-quiet window counts.
    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(600)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('c')
  })

  it('does not fire after the component unmounts', () => {
    const callback = vi.fn()
    const { result, unmount } = renderHook(() =>
      useDebouncedCallback(callback, 600),
    )

    result.current('x')
    unmount()
    vi.advanceTimersByTime(600)
    expect(callback).not.toHaveBeenCalled()
  })
})
