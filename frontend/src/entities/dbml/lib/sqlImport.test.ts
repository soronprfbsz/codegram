import { describe, it, expect } from 'vitest'
import { importSqlToDbml } from './sqlImport'

describe('importSqlToDbml', () => {
  it('imports a PostgreSQL CREATE TABLE with PK / NOT NULL / FK to DBML', () => {
    const sql =
      'CREATE TABLE users (id SERIAL PRIMARY KEY, email VARCHAR(255) NOT NULL);\n' +
      'CREATE TABLE posts (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id));'
    const result = importSqlToDbml(sql, 'postgres')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.dbml).toContain('Table "users"')
    expect(result.dbml).toContain('Table "posts"')
    expect(result.dbml).toContain('[pk, increment]')
    expect(result.dbml).toContain('[not null]')
    expect(result.dbml).toContain('Ref:"users"."id" < "posts"."user_id"')
  })

  it('imports a MySQL CREATE TABLE to DBML', () => {
    const sql =
      'CREATE TABLE accounts (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL);'
    const result = importSqlToDbml(sql, 'mysql')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.dbml).toContain('Table "accounts"')
    expect(result.dbml).toContain('[pk, increment]')
    expect(result.dbml).toContain('[not null]')
  })

  it('imports an MS SQL CREATE TABLE to DBML', () => {
    const sql =
      'CREATE TABLE accounts (id INT IDENTITY(1,1) PRIMARY KEY, name VARCHAR(100) NOT NULL);'
    const result = importSqlToDbml(sql, 'mssql')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.dbml).toContain('Table "accounts"')
    expect(result.dbml).toContain('[not null]')
  })

  it('reports "No tables found" for empty input (does not throw)', () => {
    const result = importSqlToDbml('   ', 'postgres')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected not ok')
    expect(result.errors).toEqual([{ message: 'No tables found in SQL input' }])
  })

  it('reports "No tables found" for view-only DDL that yields no tables', () => {
    const result = importSqlToDbml('CREATE VIEW v AS SELECT 1;', 'postgres')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected not ok')
    expect(result.errors).toEqual([{ message: 'No tables found in SQL input' }])
  })

  it('maps malformed SQL to errors without throwing', () => {
    const result = importSqlToDbml('CREATE TABLE (', 'postgres')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected not ok')
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].message).toContain('no viable alternative')
    expect(result.errors[0].line).toBe(1)
  })
})
