import { useEffect, useRef } from 'react'

/** A debounced function that can also cancel its pending invocation. */
export interface DebouncedCallback<Args extends unknown[]> {
  (...args: Args): void
  /** Cancel a pending (not-yet-fired) invocation, if any. */
  cancel: () => void
}

/**
 * Return a debounced version of `callback`. Each invocation resets a timer;
 * only the last invocation within `delayMs` of quiet actually fires.
 * shared layer: depends on nothing upward (FSD rule).
 *
 * - Does NOT fire on mount (only when the returned function is called).
 * - Clears any pending timer on unmount so a late callback never runs.
 * - Always calls the latest `callback` (kept in a ref) without re-creating
 *   the debounced function, so consumers can pass an inline closure.
 * - Reads `delayMs` from a ref each fire, so a changed delay is honored
 *   without re-creating the debounced function.
 * - Exposes `.cancel()` so callers can drop a pending save (e.g. on switch).
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs = 600,
): DebouncedCallback<Args> {
  const callbackRef = useRef(callback)
  const delayRef = useRef(delayMs)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the refs pointing at the freshest callback/delay every render.
  useEffect(() => {
    callbackRef.current = callback
    delayRef.current = delayMs
  })

  // Clear the pending timer when the component unmounts.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const debounced = useRef<DebouncedCallback<Args>>(
    Object.assign(
      (...args: Args) => {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current)
        }
        timerRef.current = setTimeout(() => {
          timerRef.current = null
          callbackRef.current(...args)
        }, delayRef.current)
      },
      {
        cancel: () => {
          if (timerRef.current !== null) {
            clearTimeout(timerRef.current)
            timerRef.current = null
          }
        },
      },
    ),
  )

  return debounced.current
}
