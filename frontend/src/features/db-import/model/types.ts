/** DB-import DTOs mirroring backend app/schemas/introspect.py. */
export type IntrospectDialect = 'postgresql' | 'mariadb'

/** Matches backend IntrospectRequest. */
export interface IntrospectRequest {
  dialect: IntrospectDialect
  host: string
  port: number
  username: string
  password: string
  database: string
  db_schema?: string | null
  ssl: boolean
}

/** Matches backend IntrospectResponse. import_dialect is a @dbml/core SqlDialect. */
export interface IntrospectResponse {
  import_dialect: 'postgres' | 'mysql'
  ddl: string
  table_count: number
}
