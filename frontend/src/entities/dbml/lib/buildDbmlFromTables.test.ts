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

  it('round-trips a backslash in a column name through @dbml/core', () => {
    const res = buildDbmlFromTables([
      { name: 't', engine: null, columns: [{ name: 'a\\b', type: 'String', comment: null }] },
    ])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const db = new Parser().parse(res.dbml, 'dbmlv2')
    const t = db.schemas[0].tables[0]
    expect(t.fields[0].name).toBe('a\\b')
  })

  it('round-trips a backslash in a column type through @dbml/core', () => {
    const res = buildDbmlFromTables([
      { name: 't', engine: null, columns: [{ name: 'a', type: 'Str\\ing', comment: null }] },
    ])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const db = new Parser().parse(res.dbml, 'dbmlv2')
    const t = db.schemas[0].tables[0]
    expect(t.fields[0].type.type_name).toBe('Str\\ing')
  })

  it('round-trips a comment containing a backslash, quotes, and a newline (neutralized to a space)', () => {
    const comment = `back\\slash "double" 'single'\nnewline`
    const res = buildDbmlFromTables([
      { name: 't', engine: null, columns: [{ name: 'a', type: 'String', comment }] },
    ])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    // Must not throw — a raw newline inside a single-quoted DBML string breaks parsing.
    const db = new Parser().parse(res.dbml, 'dbmlv2')
    const t = db.schemas[0].tables[0]
    expect(t.fields[0].note).toBe(`back\\slash "double" 'single' newline`)
  })

  it('round-trips a column name and type that mix a backslash with a quote (escape-order regression)', () => {
    // Regression guard: if the quote char is escaped BEFORE the backslash is
    // doubled, the backslash inserted for the quote escape gets re-doubled,
    // producing invalid/garbled DBML. Backslash must be escaped first.
    const res = buildDbmlFromTables([
      { name: 't', engine: null, columns: [{ name: `a\\b"c`, type: `d\\e"f`, comment: null }] },
    ])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const db = new Parser().parse(res.dbml, 'dbmlv2')
    const t = db.schemas[0].tables[0]
    expect(t.fields[0].name).toBe(`a\\b"c`)
    expect(t.fields[0].type.type_name).toBe(`d\\e"f`)
  })
})
