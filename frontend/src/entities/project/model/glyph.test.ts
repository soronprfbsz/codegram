import { describe, it, expect } from 'vitest'
import {
  resolveProjectColor,
  resolveProjectBgColor,
  PROJECT_FG_COLORS,
  PROJECT_BG_COLORS,
} from './glyph'

describe('resolveProjectColor (icon/text — saturated foreground)', () => {
  it('returns the mapped foreground color for a known key', () => {
    expect(resolveProjectColor('blue')).toBe(PROJECT_FG_COLORS.blue)
  })

  it('falls back to slate for null or unknown key', () => {
    expect(resolveProjectColor(null)).toBe(PROJECT_FG_COLORS.slate)
    expect(resolveProjectColor('bogus')).toBe(PROJECT_FG_COLORS.slate)
  })
})

describe('resolveProjectBgColor (background — light tint)', () => {
  it('returns the mapped tint for a known key', () => {
    expect(resolveProjectBgColor('blue')).toBe(PROJECT_BG_COLORS.blue)
  })

  it('falls back to slate for null or unknown key', () => {
    expect(resolveProjectBgColor(null)).toBe(PROJECT_BG_COLORS.slate)
    expect(resolveProjectBgColor('bogus')).toBe(PROJECT_BG_COLORS.slate)
  })

  it('background and foreground for the same key differ (no same-color pairing)', () => {
    expect(resolveProjectBgColor('blue')).not.toBe(resolveProjectColor('blue'))
  })
})
