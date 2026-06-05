import { useCallback, useEffect, useState } from 'react'
import { useDebouncedCallback } from '@/shared/hooks/useDebounce'
import { parseDbml } from '@/entities/dbml'
import type { DbmlSchema, DbmlParseError } from '@/entities/dbml'

export type DbmlParseStatus = 'idle' | 'pending' | 'success' | 'error'

export interface DbmlParseState {
  /** Lifecycle of the latest parse. */
  status: DbmlParseStatus
  /** Set when the latest parse succeeded. */
  schema?: DbmlSchema
  /** Set when the latest parse failed. */
  errors?: DbmlParseError[]
  /** The most recent successful schema, retained across a failed parse so
   *  the summary keeps showing the last good model (D4 choice). */
  lastValidSchema?: DbmlSchema
}

/**
 * Debounced live parse of DBML text into the normalized model + errors.
 * Reuses the shared useDebouncedCallback (Plan 2). Empty text is `idle`; a
 * non-empty change goes `pending` immediately, then settles to `success`
 * (schema + lastValidSchema) or `error` (errors; lastValidSchema retained)
 * after `delayMs` of quiet. parseDbml never throws (returns a result), so
 * this hook never crashes the editor.
 * features layer: depends on entities/dbml + shared (FSD downward imports).
 */
export function useDbmlParse(text: string, delayMs = 300): DbmlParseState {
  const [state, setState] = useState<DbmlParseState>({ status: 'idle' })

  const performParse = useCallback((source: string) => {
    const result = parseDbml(source)
    if (result.ok) {
      setState({
        status: 'success',
        schema: result.schema,
        lastValidSchema: result.schema,
      })
    } else {
      setState((prev) => ({
        status: 'error',
        errors: result.errors,
        lastValidSchema: prev.lastValidSchema,
      }))
    }
  }, [])

  const debouncedParse = useDebouncedCallback(performParse, delayMs)

  useEffect(() => {
    if (text === '') {
      debouncedParse.cancel()
      setState((prev) => ({ status: 'idle', lastValidSchema: prev.lastValidSchema }))
      return
    }
    setState((prev) => ({ ...prev, status: 'pending' }))
    debouncedParse(text)
    return () => {
      debouncedParse.cancel()
    }
  }, [text, debouncedParse])

  return state
}
