import { describe, it, expect } from 'vitest'
import { extractEnumCheckValues, parseEnumCheck } from './enumCheck'

describe('parseEnumCheck — constrained column', () => {
  it('extracts the column from an ANY(ARRAY) check', () => {
    const r = parseEnumCheck("failure_reason = ANY (ARRAY['a'::text, 'b'::text])")
    expect(r.column).toBe('failure_reason')
    expect(r.values).toEqual(['a', 'b'])
  })

  it('extracts the column from an IN check', () => {
    expect(parseEnumCheck("status IN ('x', 'y')").column).toBe('status')
  })

  it('strips quotes and schema/table qualifiers from the column', () => {
    expect(parseEnumCheck(`"failure_reason" IN ('a')`).column).toBe('failure_reason')
  })

  it('returns null column for a non-enum check', () => {
    expect(parseEnumCheck('http_status >= 100').column).toBeNull()
  })
})

describe('extractEnumCheckValues', () => {
  it('extracts values from a Postgres ANY(ARRAY[...]) check with ::text casts', () => {
    const expr =
      "failure_reason = ANY (ARRAY['invalid_credentials'::text, 'user_disabled'::text, 'adapter_error'::text])"
    expect(extractEnumCheckValues(expr)).toEqual([
      'invalid_credentials',
      'user_disabled',
      'adapter_error',
    ])
  })

  it('extracts values from a standard IN (...) check', () => {
    expect(extractEnumCheckValues("status IN ('active', 'disabled', 'pending')")).toEqual([
      'active',
      'disabled',
      'pending',
    ])
  })

  it('unescapes doubled single quotes', () => {
    expect(extractEnumCheckValues("label IN ('it''s', 'ok')")).toEqual(["it's", 'ok'])
  })

  it('returns [] for a non-enum check (numeric range)', () => {
    expect(extractEnumCheckValues('http_status >= 100 AND http_status <= 599')).toEqual([])
  })

  it('returns [] for an empty array literal', () => {
    expect(extractEnumCheckValues('x = ANY (ARRAY[]::text[])')).toEqual([])
  })
})
