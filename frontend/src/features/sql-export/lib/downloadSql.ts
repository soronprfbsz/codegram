import { exportDbmlToSql, type SqlDialect } from '@/entities/dbml'
import { downloadBlob } from '@/shared/lib/download'

/**
 * Convert the current DBML to SQL for `dialect` and trigger a browser
 * download named `schema.<dialect>.sql`. Returns true if a file was
 * produced. On a conversion failure it downloads nothing and returns false
 * (belt-and-suspenders: pages disables the Export trigger while the DBML is
 * invalid/empty, so this branch is unreachable in normal UI). The SQL string
 * is wrapped in a text/plain Blob and handed to the shared downloadBlob.
 * features layer: depends on entities/dbml + shared/lib (FSD downward).
 */
export function downloadSql(dbml: string, dialect: SqlDialect): boolean {
  const result = exportDbmlToSql(dbml, dialect)
  if (!result.ok) return false
  downloadBlob(
    new Blob([result.sql], { type: 'text/plain' }),
    `schema.${dialect}.sql`,
  )
  return true
}
