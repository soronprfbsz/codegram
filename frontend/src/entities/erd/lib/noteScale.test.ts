import { describe, it, expect } from 'vitest'
import { clampNoteScale, NOTE_SCALE_MIN, NOTE_SCALE_MAX } from './noteScale'

describe('clampNoteScale', () => {
  it('treats a missing scale as the default size', () => {
    expect(clampNoteScale(undefined)).toBe(NOTE_SCALE_MIN)
  })

  it('passes an in-range scale through', () => {
    expect(clampNoteScale(1.8)).toBe(1.8)
  })

  it('never shrinks below the default size', () => {
    expect(clampNoteScale(0.4)).toBe(NOTE_SCALE_MIN)
    expect(clampNoteScale(-2)).toBe(NOTE_SCALE_MIN)
  })

  it('caps at the maximum', () => {
    expect(clampNoteScale(99)).toBe(NOTE_SCALE_MAX)
  })

  it('rejects non-finite values (hand-edited layout JSON)', () => {
    expect(clampNoteScale(Number.NaN)).toBe(NOTE_SCALE_MIN)
    expect(clampNoteScale(Number.POSITIVE_INFINITY)).toBe(NOTE_SCALE_MAX)
  })
})
