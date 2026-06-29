import { describe, it, expect } from 'vitest'
import { splitTypeLength, keyLabel } from './buildXlsx'

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
