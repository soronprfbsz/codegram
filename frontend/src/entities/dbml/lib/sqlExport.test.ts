import { describe, it, expect } from 'vitest'
import { exportDbmlToSql } from './sqlExport'
import { importSqlToDbml } from './sqlImport'

const DBML = 'Table users {\n  id int [pk]\n  email varchar\n}'

describe('exportDbmlToSql', () => {
  it('exports DBML to PostgreSQL containing CREATE TABLE', () => {
    const result = exportDbmlToSql(DBML, 'postgres')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.sql).toContain('CREATE TABLE "users"')
    expect(result.sql).toContain('PRIMARY KEY')
  })

  it('exports DBML to MySQL containing CREATE TABLE', () => {
    const result = exportDbmlToSql(DBML, 'mysql')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.sql).toContain('CREATE TABLE `users`')
  })

  it('maps invalid DBML to errors without throwing', () => {
    const result = exportDbmlToSql('Table users {{{ broken', 'postgres')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected not ok')
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].message.length).toBeGreaterThan(0)
  })

  // Intentional decision: an empty/whitespace (valid-but-no-table) schema
  // legitimately exports to empty SQL, so this stays { ok: true, sql: '' } with
  // no "No tables found" guard (unlike the import side). The editor UI gates the
  // export trigger behind a non-empty schema, so this path is not user-reachable.
  it('exports empty/whitespace DBML to { ok: true, sql: "" }', () => {
    const result = exportDbmlToSql('   ', 'postgres')
    expect(result).toEqual({ ok: true, sql: '' })
  })

  it('round-trips PostgreSQL SQL -> DBML -> SQL preserving the table', () => {
    const sql =
      'CREATE TABLE users (id SERIAL PRIMARY KEY, email VARCHAR(255) NOT NULL);'
    const imported = importSqlToDbml(sql, 'postgres')
    expect(imported.ok).toBe(true)
    if (!imported.ok) throw new Error('expected ok')
    const exported = exportDbmlToSql(imported.dbml, 'postgres')
    expect(exported.ok).toBe(true)
    if (!exported.ok) throw new Error('expected ok')
    expect(exported.sql).toContain('CREATE TABLE "users"')
  })
})
