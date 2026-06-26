import { describe, it, expect } from 'vitest'
import { SQL_DIALECTS, SQL_DIALECT_VALUES } from './sqlTypes'

describe('SQL dialects', () => {
  it('supports only postgres and mysql (no mssql)', () => {
    expect(SQL_DIALECT_VALUES).toEqual(['postgres', 'mysql'])
    expect(Object.keys(SQL_DIALECTS).sort()).toEqual(['mysql', 'postgres'])
    expect('mssql' in SQL_DIALECTS).toBe(false)
  })
})
