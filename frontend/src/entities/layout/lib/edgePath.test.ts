import { describe, it, expect } from 'vitest'
import {
  buildManualPath,
  dragSegment,
  editVertexAxis,
  simplifyPath,
  pruneEdgePaths,
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
