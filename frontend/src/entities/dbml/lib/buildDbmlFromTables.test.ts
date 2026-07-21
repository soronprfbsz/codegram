import { describe, it, expect } from 'vitest'
import { Parser } from '@dbml/core'
import { buildDbmlFromTables } from './buildDbmlFromTables'

describe('buildDbmlFromTables', () => {
  it('preserves complex ClickHouse types via quoting (round-trips through @dbml/core)', () => {
    const res = buildDbmlFromTables([
      {
        name: 'events',
        engine: 'MergeTree',
        columns: [
          { name: 'org_id', type: 'LowCardinality(String)', comment: null },
          { name: 'data_class', type: "Enum8('operational' = 1, 'regulated' = 2)", comment: 'sensitivity' },
          { name: 'tags', type: 'Map(LowCardinality(String), String)', comment: null },
        ],
      },
    ])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const db = new Parser().parse(res.dbml, 'dbmlv2')
    const t = db.schemas[0].tables[0]
    expect(t.fields.map((f: { type: { type_name: string } }) => f.type.type_name)).toEqual([
      'LowCardinality(String)',
      "Enum8('operational' = 1, 'regulated' = 2)",
      'Map(LowCardinality(String), String)',
    ])
    expect(t.fields[1].note).toBe('sensitivity')
    expect(res.dbml).toContain("Note: 'MergeTree'")
  })

  it('skips zero-column tables (DBML requires >=1 column)', () => {
    const res = buildDbmlFromTables([
      { name: 'ok', engine: null, columns: [{ name: 'id', type: 'UUID', comment: null }] },
      { name: 'empty', engine: 'View', columns: [] },
    ])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.dbml).toContain('Table "ok"')
    expect(res.dbml).not.toContain('Table "empty"')
    // still valid DBML
    expect(() => new Parser().parse(res.dbml, 'dbmlv2')).not.toThrow()
  })

  it('returns an error when no table has columns', () => {
    const res = buildDbmlFromTables([{ name: 'empty', engine: null, columns: [] }])
    expect(res.ok).toBe(false)
  })

  it('escapes double quotes in identifiers and single quotes in notes', () => {
    const res = buildDbmlFromTables([
      { name: 'weird', engine: null, columns: [{ name: 'a"b', type: 'String', comment: "it's" }] },
    ])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const db = new Parser().parse(res.dbml, 'dbmlv2')
    const t = db.schemas[0].tables[0]
    expect(t.fields[0].name).toBe('a"b')
    expect(t.fields[0].note).toBe("it's")
  })
})
