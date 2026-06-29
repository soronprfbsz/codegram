import { describe, it, expect } from 'vitest'
import { splitTypeLength, keyLabel, splitSchema } from './buildXlsx'

describe('splitTypeLength', () => {
  it('splits a parenthesized length out of the type name', () => {
    expect(splitTypeLength('varchar(255)')).toEqual({ typeName: 'varchar', length: '255' })
  })

  it('returns an empty length when the type has no parentheses', () => {
    expect(splitTypeLength('int')).toEqual({ typeName: 'int', length: '' })
  })

  it('keeps a composite length verbatim (e.g. numeric precision/scale)', () => {
    expect(splitTypeLength('numeric(10,2)')).toEqual({ typeName: 'numeric', length: '10,2' })
  })

  it('handles an empty type string', () => {
    expect(splitTypeLength('')).toEqual({ typeName: '', length: '' })
  })
})

describe('keyLabel', () => {
  it('labels a primary key PK', () => {
    expect(keyLabel({ pk: true, unique: false, fk: false })).toBe('PK')
  })

  it('labels a unique column UK', () => {
    expect(keyLabel({ pk: false, unique: true, fk: false })).toBe('UK')
  })

  it('labels a foreign key FK', () => {
    expect(keyLabel({ pk: false, unique: false, fk: true })).toBe('FK')
  })

  it('combines flags in PK,UK,FK order', () => {
    expect(keyLabel({ pk: true, unique: false, fk: true })).toBe('PK,FK')
    expect(keyLabel({ pk: true, unique: true, fk: true })).toBe('PK,UK,FK')
  })

  it('returns an empty string when no key flag is set', () => {
    expect(keyLabel({ pk: false, unique: false, fk: false })).toBe('')
  })
})

describe('splitSchema', () => {
  it('splits DB name and schema name on the first underscore', () => {
    expect(splitSchema('hawkeye_core')).toEqual({ dbName: 'hawkeye', schemaName: 'core' })
  })

  it('keeps everything after the first underscore as the schema name', () => {
    expect(splitSchema('a_b_c')).toEqual({ dbName: 'a', schemaName: 'b_c' })
  })

  it('leaves DB name blank and uses the whole value as schema when there is no underscore', () => {
    expect(splitSchema('public')).toEqual({ dbName: '', schemaName: 'public' })
  })

  it('handles an empty schema string', () => {
    expect(splitSchema('')).toEqual({ dbName: '', schemaName: '' })
  })
})
