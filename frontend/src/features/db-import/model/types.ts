/** DB-import DTOs mirroring backend app/schemas/introspect.py. */
import type { IntrospectedTable } from '@/entities/dbml'

export type IntrospectDialect = 'postgresql' | 'mariadb' | 'clickhouse'

/** Matches backend IntrospectRequest. */
export interface IntrospectRequest {
  dialect: IntrospectDialect
  host: string
  port: number
  username: string
  password: string
  database: string
  db_schemas?: string[]
  ssl: boolean
}

/** Matches backend IntrospectResponse. PostgreSQL/MariaDB return ddl +
 *  import_dialect; ClickHouse returns structured tables instead (ADR-0021). */
export interface IntrospectResponse {
  import_dialect?: 'postgres' | 'mysql'
  ddl?: string
  tables?: IntrospectedTable[]
  table_count: number
}

/** Matches backend SchemaListResponse. */
export interface SchemaListResponse {
  schemas: string[]
}
