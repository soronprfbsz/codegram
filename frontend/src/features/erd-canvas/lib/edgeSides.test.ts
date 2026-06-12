import { describe, it, expect } from 'vitest'
import { resolveEdgeSides } from './edgeSides'

describe('resolveEdgeSides (geometry-based FK anchor sides)', () => {
  it('uses defaults (source right, target left) when the target is to the RIGHT of the source', () => {
    // PK source on the left, FK target on the right → direct facing path, no flip.
    expect(resolveEdgeSides(0, 400)).toEqual({ sourceSide: 'right', targetSide: 'left' })
  })

  it('FLIPS to face each other when the target is to the LEFT of the source', () => {
    // FK target sits left of its PK source → without flipping, the edge would wrap
    // around the target to reach its fixed left handle. Flip both to face.
    expect(resolveEdgeSides(400, 0)).toEqual({ sourceSide: 'left', targetSide: 'right' })
  })

  it('uses defaults when the two tables share the same X (no clear left/right)', () => {
    expect(resolveEdgeSides(120, 120)).toEqual({ sourceSide: 'right', targetSide: 'left' })
  })

  it('lets a stored manual override win over geometry (both ends)', () => {
    // Geometry would say source:right/target:left, but the user swapped both.
    expect(
      resolveEdgeSides(0, 400, { sourceSide: 'left', targetSide: 'right' }),
    ).toEqual({ sourceSide: 'left', targetSide: 'right' })
  })

  it('lets a stored override win on ONE end while geometry decides the other', () => {
    // target left of source → geometry source:left/target:right; user pinned target:left.
    expect(resolveEdgeSides(400, 0, { targetSide: 'left' })).toEqual({
      sourceSide: 'left',
      targetSide: 'left',
    })
  })
})
