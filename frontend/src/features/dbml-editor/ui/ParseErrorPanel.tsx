import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import type { DbmlParseError } from '@/entities/dbml'
import type { DbmlParseStatus } from '../model/useDbmlParse'

export interface ParseErrorPanelProps {
  /** Current parse lifecycle. */
  status: DbmlParseStatus
  /** Parse errors, present only when status is "error". */
  errors?: DbmlParseError[]
  /** Optional className forwarded to the root Card (e.g. for floating panel styles). */
  className?: string
}

/**
 * Read-only parse-status panel: a "valid" affordance when parsing succeeds,
 * a "parsing…" hint while pending, or a list of errors (message + line/column
 * when available) when parsing fails. Purely presentational — it receives the
 * parse state as props and does no parsing itself.
 * features layer: depends on shared + entities/dbml (FSD downward imports).
 */
export function ParseErrorPanel({ status, errors, className }: ParseErrorPanelProps) {
  return (
    <Card size="sm" className={className}>
      <CardHeader>
        <CardTitle className="text-sm">Parse status</CardTitle>
      </CardHeader>
      <CardContent>
        {status === 'pending' && (
          <p className="text-sm text-muted-foreground">Parsing…</p>
        )}
        {status === 'idle' && (
          <p className="text-sm text-muted-foreground">Start typing DBML…</p>
        )}
        {status === 'success' && (
          <p className="text-sm text-success">Valid DBML</p>
        )}
        {status === 'error' && (
          <ul role="alert" aria-live="polite" className="flex flex-col gap-1">
            {(errors ?? []).map((err, i) => (
              <li key={i} className="text-sm text-destructive">
                {err.message}
                {typeof err.line === 'number' &&
                  typeof err.column === 'number' && (
                    <span className="ml-2 text-xs text-destructive">
                      (line {err.line}, column {err.column})
                    </span>
                  )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
