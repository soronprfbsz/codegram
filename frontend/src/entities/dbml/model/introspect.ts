/** Structured introspection result for dialects without a DDL path (ClickHouse,
 *  ADR-0021). Mirrors backend IntrospectedTable/IntrospectedColumn. Lives in
 *  entities/dbml because buildDbmlFromTables consumes it (FSD: features → entities). */
export interface IntrospectedColumn {
  name: string
  type: string
  comment: string | null
}

export interface IntrospectedTable {
  name: string
  engine: string | null
  columns: IntrospectedColumn[]
}
