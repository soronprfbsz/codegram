import { CompilerError } from '@dbml/core'
import type { DbmlParseError } from '../model/types'

/**
 * Convert a CompilerError's diags into our parse-error shape.
 * line/column come from diag.location.start. Shared by parseDbml and the SQL
 * adapters so the @dbml/core boundary mapping lives in exactly one place.
 * With no diags, fall back to the caller's literal message.
 */
export function compilerErrorToParseErrors(
  err: CompilerError,
  fallback: string,
): DbmlParseError[] {
  const diags = Array.isArray(err.diags) ? err.diags : []
  if (diags.length === 0) {
    return [{ message: fallback }]
  }
  return diags.map((diag) => {
    const start = diag.location?.start
    return {
      message: diag.message,
      line: typeof start?.line === 'number' ? start.line : undefined,
      column: typeof start?.column === 'number' ? start.column : undefined,
    }
  })
}
