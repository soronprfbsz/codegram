import { describe, it, expect } from 'vitest'
import { exportDbmlToSql } from './sqlExport'

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

  it('exports DBML to MS SQL containing CREATE TABLE', () => {
    const result = exportDbmlToSql(DBML, 'mssql')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.sql).toContain('CREATE TABLE [users]')
  })

  it('maps invalid DBML to errors without throwing', () => {
    const result = exportDbmlToSql('Table users {{{ broken', 'postgres')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected not ok')
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].message.length).toBeGreaterThan(0)
  })
})
