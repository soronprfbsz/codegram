import { useEffect, useRef } from 'react'

/**
 * Return a debounced version of `callback`. Each invocation resets a timer;
 * only the last invocation within `delayMs` of quiet actually fires.
 * shared layer: depends on nothing upward (FSD rule).
 *
 * - Does NOT fire on mount (only when the returned function is called).
 * - Clears any pending timer on unmount so a late callback never runs.
 * - Always calls the latest `callback` (kept in a ref) without re-creating
 *   the debounced function, so consumers can pass an inline closure.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs = 600,
): (...args: Args) => void {
  const callbackRef = useRef(callback)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the ref pointing at the freshest callback every render.
  useEffect(() => {
    callbackRef.current = callback
  })

  // Clear the pending timer when the component unmounts.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const debounced = useRef((...args: Args) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      callbackRef.current(...args)
    }, delayMs)
  })

  return debounced.current
}
