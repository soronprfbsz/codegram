import { exportDbmlToSql, type SqlDialect } from '@/entities/dbml'
import { downloadBlob } from '@/shared/lib/download'

/**
 * Convert the CURRENT DBML to SQL for `dialect` and trigger a browser
 * download named `schema.<dialect>.sql`. Returns true if a file was
 * produced. This exports the live `dbmlText`, which CAN be invalid while the
 * Export trigger is still enabled: pages gates the trigger on the retained
 * last-valid schema (`parse.schema ?? parse.lastValidSchema`), so a mid-edit
 * invalid current text leaves the trigger enabled even though
 * `exportDbmlToSql(currentText)` fails. In that case this warns and returns
 * false, downloading nothing. On success the SQL string is wrapped in a
 * text/plain Blob and handed to the shared downloadBlob.
 * features layer: depends on entities/dbml + shared/lib (FSD downward).
 */
export function downloadSql(dbml: string, dialect: SqlDialect): boolean {
  const result = exportDbmlToSql(dbml, dialect)
  if (!result.ok) {
    console.warn('SQL export failed: current DBML is invalid', result.errors)
    return false
  }
  downloadBlob(
    new Blob([result.sql], { type: 'text/plain' }),
    `schema.${dialect}.sql`,
  )
  return true
}
