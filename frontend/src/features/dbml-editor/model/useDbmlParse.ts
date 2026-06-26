import { useCallback, useEffect, useMemo, useState } from 'react'
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
/** Internal state also tracks WHICH source produced the current result, so a
 *  render that runs before the pending-effect can detect a not-yet-parsed text
 *  and avoid surfacing the previous text's (stale) schema/status. */
interface InternalParseState extends DbmlParseState {
  /** The exact `text` that `schema`/`errors`/`status` describe. */
  parsedText?: string
}

export function useDbmlParse(text: string, delayMs = 300): DbmlParseState {
  const [state, setState] = useState<InternalParseState>({ status: 'idle' })

  const performParse = useCallback((source: string) => {
    const result = parseDbml(source)
    if (result.ok) {
      setState({
        status: 'success',
        schema: result.schema,
        lastValidSchema: result.schema,
        parsedText: source,
      })
    } else {
      setState((prev) => ({
        status: 'error',
        errors: result.errors,
        lastValidSchema: prev.lastValidSchema,
        parsedText: source,
      }))
    }
  }, [])

  const debouncedParse = useDebouncedCallback(performParse, delayMs)

  useEffect(() => {
    if (text === '') {
      debouncedParse.cancel()
      setState((prev) => ({ status: 'idle', lastValidSchema: prev.lastValidSchema, parsedText: '' }))
      return
    }
    // Clear the current `schema` while pending so SchemaSummary
    // (schema ?? lastValidSchema) does not show a definitively-stale schema
    // during the debounce window after a project switch. lastValidSchema is
    // retained as the fallback.
    setState((prev) => ({
      status: 'pending',
      lastValidSchema: prev.lastValidSchema,
      parsedText: prev.parsedText,
    }))
    debouncedParse(text)
    return () => {
      debouncedParse.cancel()
    }
  }, [text, debouncedParse])

  // Synchronous guard: when `text` changes, the pending-effect above runs AFTER
  // this render — so for one render `state` still describes the PREVIOUS text
  // (e.g. the previous project's successful schema right after a project
  // switch). Surfacing it would let consumers treat the old project's schema as
  // the new one's settled result (the loading gate opened on the wrong diagram).
  // If the latest `text` hasn't been parsed yet, report `pending` and hide the
  // stale schema/errors; lastValidSchema stays as the fallback. Memoized so the
  // corrected object keeps a stable identity across renders (an unstable parse
  // object would loop consumers' effects → "Maximum update depth").
  return useMemo<DbmlParseState>(() => {
    if (text !== '' && state.parsedText !== text) {
      return { status: 'pending', lastValidSchema: state.lastValidSchema }
    }
    return state
  }, [text, state])
}
