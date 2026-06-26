import { describe, it, expect } from 'vitest'
import {
  buildManualPath,
  dragSegment,
  editVertexAxis,
  simplifyPath,
  pruneEdgePaths,
  applyEdgeSide,
  clampSegmentDrag,
} from './edgePath'

// 기준 Z-경로: source(0,0) → (50,0) → (50,100) → target(100,100)
const S = { x: 0, y: 0 }
const T = { x: 100, y: 100 }
const Z = [{ x: 50, y: 0 }, { x: 50, y: 100 }]

describe('simplifyPath', () => {
  it('merges consecutive collinear points', () => {
    expect(
      simplifyPath([S, { x: 50, y: 0 }, { x: 50, y: 40 }, { x: 50, y: 100 }, T]),
    ).toEqual([S, { x: 50, y: 0 }, { x: 50, y: 100 }, T])
  })
  it('drops duplicate points', () => {
    expect(simplifyPath([S, { x: 50, y: 0 }, { x: 50, y: 0 }, T])).toEqual([
      S,
      { x: 50, y: 0 },
      T,
    ])
  })
})

describe('buildManualPath', () => {
  it('keeps an already-orthogonal corner sequence as-is', () => {
    expect(buildManualPath(S, T, Z)).toEqual([S, ...Z, T])
  })
  it('stretches the trailing segment when the target moved (dbdiagram dbd-14)', () => {
    // target이 (100,140)으로 이동 → 세로 세그먼트가 늘어나 재연결
    expect(buildManualPath(S, { x: 100, y: 140 }, Z)).toEqual([
      S,
      { x: 50, y: 0 },
      { x: 50, y: 140 },
      { x: 100, y: 140 },
    ])
  })
  it('bridges horizontally-first when the source moved vertically', () => {
    expect(buildManualPath({ x: 0, y: -20 }, T, Z)).toEqual([
      { x: 0, y: -20 },
      { x: 50, y: -20 },
      { x: 50, y: 100 },
      T,
    ])
  })
  it('renders a straight line when there are no waypoints and rows align', () => {
    expect(buildManualPath(S, { x: 100, y: 0 }, [])).toEqual([S, { x: 100, y: 0 }])
  })
})

describe('dragSegment', () => {
  const full = [S, ...Z, T]
  it('moves a vertical segment horizontally and returns interior waypoints', () => {
    expect(dragSegment(full, 1, 70)).toEqual([
      { x: 70, y: 0 },
      { x: 70, y: 100 },
    ])
  })
  it('moves a horizontal segment vertically', () => {
    // 가운데 세그먼트가 진짜 가로인 경로: (0,0)→(0,50)→(100,50)→(100,100)
    const f = [S, { x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 100 }]
    expect(dragSegment(f, 1, 30)).toEqual([
      { x: 0, y: 30 },
      { x: 100, y: 30 },
    ])
  })
  it('inserts a stub corner when dragging the first (source-anchored) segment', () => {
    expect(dragSegment(full, 0, 30)).toEqual([
      { x: 0, y: 30 },
      { x: 50, y: 30 },
      { x: 50, y: 100 },
    ])
  })
  it('inserts a stub corner when dragging the last (target-anchored) segment', () => {
    expect(dragSegment(full, 2, 60)).toEqual([
      { x: 50, y: 0 },
      { x: 50, y: 60 },
      { x: 100, y: 60 },
    ])
  })
  it('auto-merges when the drag re-aligns segments (Q4 경계 시나리오)', () => {
    // 스텁이 있는 경로를 다시 y=0으로 끌면 스텁이 병합되어 사라진다
    const stubbed = [S, { x: 0, y: 30 }, { x: 50, y: 30 }, { x: 50, y: 100 }, T]
    expect(dragSegment(stubbed, 1, 0)).toEqual(Z)
  })
})

describe('editVertexAxis', () => {
  const full = [S, ...Z, T]
  it('x-edit drags the vertical adjacent segment', () => {
    expect(editVertexAxis(full, 0, 'x', 70)).toEqual([
      { x: 70, y: 0 },
      { x: 70, y: 100 },
    ])
  })
  it('y-edit of a source-adjacent vertex inserts a stub (segment-drag semantics)', () => {
    expect(editVertexAxis(full, 0, 'y', 30)).toEqual([
      { x: 0, y: 30 },
      { x: 50, y: 30 },
      { x: 50, y: 100 },
    ])
  })
  it('x-edit of a middle vertex drags its vertical adjacent segment (no stub)', () => {
    // (0,0)→(0,50)→(60,50)→(60,120)→(140,120)→(140,200): 4 interior vertices
    const longFull = [
      { x: 0, y: 0 },
      { x: 0, y: 50 },
      { x: 60, y: 50 },
      { x: 60, y: 120 },
      { x: 140, y: 120 },
      { x: 140, y: 200 },
    ]
    // vertex index 1 == full[2] == (60,50); its x is owned by the vertical
    // segment (60,50)→(60,120) → that segment moves to x=80
    expect(editVertexAxis(longFull, 1, 'x', 80)).toEqual([
      { x: 0, y: 50 },
      { x: 80, y: 50 },
      { x: 80, y: 120 },
      { x: 140, y: 120 },
    ])
  })
})

describe('pruneEdgePaths', () => {
  it('drops entries whose edge id is gone', () => {
    const paths = {
      'a#0': { waypoints: Z },
      'gone#0': { waypoints: Z },
    }
    expect(pruneEdgePaths(paths, new Set(['a#0']))).toEqual({
      'a#0': { waypoints: Z },
    })
  })
})

describe('clampSegmentDrag (카드 최소 클리어런스 침범 금지)', () => {
  // A card at x[100,300] y[100,200]; clearance 14 → forbidden y[86,214] when the
  // segment's x-span overlaps x[86,314].
  const card = { x: 100, y: 100, width: 200, height: 100 }
  const a = { x: 150, y: 0 } // horizontal segment spanning x 150..250 (overlaps card x)
  const b = { x: 250, y: 0 }

  it('stops a horizontal segment at the inflated top edge instead of crossing in', () => {
    // Dragging down from y=0 toward y=160 (inside the card) → clamps to top-14.
    expect(clampSegmentDrag(a, b, true, 160, [card], 14)).toBe(100 - 14)
  })

  it('allows a move that stays clear of the card', () => {
    expect(clampSegmentDrag(a, b, true, 50, [card], 14)).toBe(50)
  })

  it('ignores a card the segment does not overlap along its length', () => {
    const farA = { x: 400, y: 0 }
    const farB = { x: 500, y: 0 } // x 400..500, no overlap with card x[86,314]
    expect(clampSegmentDrag(farA, farB, true, 160, [card], 14)).toBe(160)
  })

  it('clamps a vertical segment to the inflated left/right edge', () => {
    const va = { x: 0, y: 120 } // vertical-ish? actually spans y 120..180 (overlaps card y)
    const vb = { x: 0, y: 180 }
    // Dragging right from x=0 toward x=160 (inside card x) → clamp to left-14.
    expect(clampSegmentDrag(va, vb, false, 160, [card], 14)).toBe(100 - 14)
  })
})

describe('applyEdgeSide (드래그-플립 앵커 면)', () => {
  it('records the chosen side on a fresh entry', () => {
    expect(applyEdgeSide(undefined, 'source', 'left')).toEqual({
      sourceSide: 'left',
    })
    expect(applyEdgeSide(undefined, 'target', 'right')).toEqual({
      targetSide: 'right',
    })
  })

  it('ALWAYS stores the explicit pick — even the geometric-default side', () => {
    // The drag is an explicit choice; un-stored defaults are geometry-derived,
    // so a stored side must win over geometry (otherwise the flip is undone).
    expect(applyEdgeSide(undefined, 'source', 'right')).toEqual({ sourceSide: 'right' })
    expect(applyEdgeSide({ sourceSide: 'left' }, 'source', 'right')).toEqual({
      sourceSide: 'right',
    })
    expect(applyEdgeSide({ targetSide: 'right' }, 'target', 'left')).toEqual({
      targetSide: 'left',
    })
  })

  it('clears manual waypoints — the old geometry dies with the side flip', () => {
    expect(
      applyEdgeSide({ waypoints: Z, targetSide: 'right' }, 'source', 'left'),
    ).toEqual({ sourceSide: 'left', targetSide: 'right' })
  })

  it('keeps the OTHER end untouched when one end flips', () => {
    expect(
      applyEdgeSide({ sourceSide: 'left', targetSide: 'right' }, 'source', 'right'),
    ).toEqual({ sourceSide: 'right', targetSide: 'right' })
  })
})
