import { describe, it, expect } from 'vitest'
import { resolveProjectColor, PROJECT_COLORS } from './glyph'

describe('resolveProjectColor', () => {
  it('returns the mapped color for a known key', () => {
    expect(resolveProjectColor('blue')).toBe(PROJECT_COLORS.blue)
  })

  it('falls back to slate for null or unknown key', () => {
    expect(resolveProjectColor(null)).toBe(PROJECT_COLORS.slate)
    expect(resolveProjectColor('bogus')).toBe(PROJECT_COLORS.slate)
  })
})
