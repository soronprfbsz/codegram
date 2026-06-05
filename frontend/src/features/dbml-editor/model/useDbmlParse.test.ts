import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDbmlParse } from './useDbmlParse'

afterEach(() => {
  vi.useRealTimers()
})

describe('useDbmlParse', () => {
  it('starts idle for empty text', () => {
    const { result } = renderHook(({ text }) => useDbmlParse(text), {
      initialProps: { text: '' },
    })
    expect(result.current.status).toBe('idle')
    expect(result.current.schema).toBeUndefined()
  })

  it('goes pending then success after the debounce for valid DBML', async () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ text }) => useDbmlParse(text, 300),
      { initialProps: { text: '' } },
    )

    rerender({ text: 'Table users {\n  id int [pk]\n}' })
    expect(result.current.status).toBe('pending')

    act(() => {
      vi.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })
    expect(result.current.schema?.tables).toHaveLength(1)
    expect(result.current.schema?.tables[0]?.name).toBe('users')
    expect(result.current.errors).toBeUndefined()
  })

  it('reports errors without throwing and keeps the last valid schema', async () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ text }) => useDbmlParse(text, 300),
      { initialProps: { text: '' } },
    )

    // First settle on a valid schema.
    rerender({ text: 'Table users {\n  id int [pk]\n}' })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })

    // Then feed invalid DBML.
    rerender({ text: 'Table users {' })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    await waitFor(() => {
      expect(result.current.status).toBe('error')
    })
    expect(result.current.errors?.length).toBeGreaterThan(0)
    // last good schema retained for the summary (D4 choice)
    expect(result.current.lastValidSchema?.tables).toHaveLength(1)
  })
})
