import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import type { DbmlSchema } from '@/entities/dbml'

export interface SchemaSummaryProps {
  /** The latest normalized schema to summarize (undefined → placeholder). */
  schema?: DbmlSchema
  /** Optional className forwarded to the root Card (e.g. for floating panel styles). */
  className?: string
}

/**
 * Read-only summary of the normalized DBML model: entity counts and the list
 * of table names. NOT a diagram — there is no canvas/node/edge rendering
 * (that is Plan 3b). It exists to prove the parse produced a consumable model
 * and to give the editor page (and Playwright) a verifiable target.
 * features layer: depends on shared + entities/dbml (FSD downward imports).
 */
export function SchemaSummary({ schema, className }: SchemaSummaryProps) {
  if (!schema) {
    return (
      <Card size="sm" className={className}>
        <CardHeader>
          <CardTitle className="text-sm">Schema summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">No parsed schema yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card size="sm" className={className}>
      <CardHeader>
        <CardTitle className="text-sm">Schema summary</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-600">Tables</dt>
          <dd data-testid="summary-tables">{schema.tables.length}</dd>
          <dt className="text-gray-600">Refs</dt>
          <dd data-testid="summary-refs">{schema.refs.length}</dd>
          <dt className="text-gray-600">Enums</dt>
          <dd data-testid="summary-enums">{schema.enums.length}</dd>
          <dt className="text-gray-600">Table groups</dt>
          <dd data-testid="summary-groups">{schema.tableGroups.length}</dd>
          <dt className="text-gray-600">Notes</dt>
          <dd data-testid="summary-notes">{schema.notes.length}</dd>
        </dl>
        {schema.tables.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-gray-500">
              Table names
            </p>
            <ul className="flex flex-col gap-0.5 text-sm">
              {schema.tables.map((t) => (
                <li key={t.schema ? `${t.schema}.${t.name}` : t.name}>
                  {t.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
