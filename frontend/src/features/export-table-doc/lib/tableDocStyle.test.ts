import { describe, it, expect } from 'vitest'
import { STANDARD_COLUMNS } from '@/entities/table-doc'
import {
  HEADER_FILL,
  STANDARD_COLUMN_WIDTHS,
  docxColumnPercents,
} from './tableDocStyle'

describe('tableDocStyle', () => {
  it('header fill is a 6-digit hex without #', () => {
    expect(HEADER_FILL).toMatch(/^[0-9A-Fa-f]{6}$/)
  })

  it('column widths align 1:1 with STANDARD_COLUMNS', () => {
    expect(STANDARD_COLUMN_WIDTHS).toHaveLength(STANDARD_COLUMNS.length)
    expect(STANDARD_COLUMN_WIDTHS.every((w) => w > 0)).toBe(true)
  })

  it('docxColumnPercents normalizes weights to integers summing to 100', () => {
    const pct = docxColumnPercents([1, 1, 2])
    expect(pct.reduce((a, b) => a + b, 0)).toBe(100)
    expect(pct.every((n) => Number.isInteger(n))).toBe(true)
  })

  it('distributes the rounding remainder so uneven weights still sum to 100', () => {
    // 100/3 = 33.33 → floor [33,33,33] (sum 99); the 1-point remainder goes to
    // one column, exercising the largest-remainder distribution path.
    const pct = docxColumnPercents([1, 1, 1])
    expect(pct.reduce((a, b) => a + b, 0)).toBe(100)
    expect(pct.filter((n) => n === 34)).toHaveLength(1)
    expect(pct.filter((n) => n === 33)).toHaveLength(2)
  })
})
