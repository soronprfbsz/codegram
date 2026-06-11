# Manual Edge Paths + Selection Info Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dbdiagram.io와 동일한 관계선 수동 재배치(세그먼트 드래그·Reset line)와, 엔티티/선 선택 시 Info 패널에서 좌표를 표시·수정하는 기능을 구현한다.

**Architecture:** 수동 경로는 `project.layout.edges[edgeId].waypoints`(절대좌표 꺾임점 배열, ADR-0012)로 저장한다. 수동 경로 엣지는 A* 라우팅을 건너뛰고 `buildManualPath`(직교 브리지 보장)로 그린다. 선택 모델은 `CanvasSelection` 구분 합집합으로 확장하고, 캔버스가 `SelectionInfo`(절대좌표·꺾임점)를 콜백으로 올려 패널이 표시하며, 패널 편집은 `ErdCaptureHandle`의 명령형 메서드로 캔버스에 내려간다. 모든 기하 연산은 순수 함수(`entities/layout/lib/edgePath.ts`)로 격리한다.

**Tech Stack:** React 19 + @xyflow/react v12, Vitest + Testing Library, Playwright E2E. FSD 레이어 규칙 준수 (entities → features → widgets → pages).

**결정 근거 문서:** `CONTEXT.md`(수동 경로·Layout 용어), `docs/adr/0012-manual-edge-paths-in-layout.md`. dbdiagram 실측: 세그먼트 중간 핸들 드래그 → 수직 이동 + 인접 세그먼트 신축 + 직각 유지, 테이블 이동 시 꺾임점 절대좌표 보존, 「Reset line」 플로팅 버튼.

**확정 결정 요약 (그릴링 세션):**
1. 직교 세그먼트 드래그 모델 (dbdiagram 충실 재현). 캔버스 핸들은 **세그먼트 중간 핸들만** — 모서리 핸들은 인접 세그먼트 2회 드래그로 대체 가능하므로 v1 제외.
2. 생존 규칙: 테이블 이동 → 유지(절대좌표·끝 세그먼트 신축) / Auto-arrange → 전체 삭제 / rename → 소실 허용(ADR-0004) / DB 동기화 → 이름 기반 보존.
3. Info 패널: 테이블·Enum·스티키 x/y 편집 가능(그룹 박스 제외), 엣지는 꺾임점 목록(끝점 제외) 표시·축별 편집, 자동 경로 엣지 편집 시 수동 전환. 좌표는 항상 절대 캔버스 좌표, 정수 반올림.
4. Enum 링크선(점선)은 선택·수동 경로 대상 아님. undo 없음(앱 일관). 직선화된 꺾임점은 자동 병합.

---

## File Structure

| 파일 | 작업 | 책임 |
|---|---|---|
| `frontend/src/entities/layout/model/types.ts` | 수정 | `StoredEdgePath`, `EdgePaths`, `StoredLayout.edges?` 추가 |
| `frontend/src/entities/layout/lib/edgePath.ts` | 생성 | 순수 기하: `buildManualPath`/`dragSegment`/`editVertexAxis`/`simplifyPath`/`pruneEdgePaths` |
| `frontend/src/entities/layout/lib/edgePath.test.ts` | 생성 | 위 기하 단위 테스트 |
| `frontend/src/entities/layout/index.ts` | 수정 | 신규 export |
| `frontend/src/entities/erd/model/types.ts` | 수정 | `RelationEdgeData.waypoints/isEdgeSelected`, `CanvasSelection`, `SelectionInfo` |
| `frontend/src/entities/erd/index.ts` | 수정 | 신규 타입 export |
| `frontend/src/features/layout-persistence/api/useLayoutPersistence.ts` | 수정 | `edgePaths` 상태 + 시드 + `layout.edges` 포함 |
| `frontend/src/features/layout-persistence/api/useLayoutPersistence.test.tsx` | 수정 | 기존 exact-shape 단언에 `edges: {}` 반영 + 신규 케이스 (파일이 이미 존재 — 새로 만들지 말 것) |
| `frontend/src/pages/editor/index.test.tsx` | 수정 | layout 형태 단언 + 캡처 핸들 목 3곳 갱신 |
| `frontend/src/features/erd-canvas/lib/edgePathContext.ts` | 생성 | 엣지→캔버스 커밋/리셋/경로보고 컨텍스트 |
| `frontend/src/features/erd-canvas/ui/RelationEdge.tsx` | 수정 | 수동 경로 렌더 + 핸들 + 드래그 + Reset 버튼 |
| `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx` | 수정 | `selection`/`edgePaths` props, 엣지 클릭, SelectionInfo 보고, 캡처 핸들 확장, Auto-arrange 경로 삭제 |
| `frontend/src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx` | 수정 | onSelect 유니언으로 갱신 + 신규 케이스 |
| `frontend/src/widgets/erd-info-panel/ui/SelectionSection.tsx` | 생성 | 선택 정보 섹션 (좌표 표시·편집 UI) |
| `frontend/src/widgets/erd-info-panel/ui/SelectionSection.test.tsx` | 생성 | 섹션 단위 테스트 |
| `frontend/src/widgets/erd-info-panel/ui/ErdInfoPanel.tsx` | 수정 | SelectionSection 합성 + props 전달 |
| `frontend/src/pages/editor/index.tsx` | 수정 | `CanvasSelection` 상태, 패널↔캔버스 배선 |
| `frontend/e2e/edge-path.spec.ts` | 생성 | E2E: 드래그·persist·reset·좌표 편집 |

**검증 명령 (저장소 루트에서, 스택 기동 상태 가정):**
- 단위: `docker compose -p codegram exec -T frontend npm run test -- --run <파일경로>`
- 전체 단위: `docker compose -p codegram exec -T frontend npm run test -- --run`
- 타입: `docker compose -p codegram exec -T frontend npm run type-check`
- E2E: `cd frontend && npx playwright test e2e/edge-path.spec.ts` (스택 :4001 서빙 중)

---

### Task 1: 저장 타입 + 순수 기하 엔진 (entities/layout)

**Files:**
- Modify: `frontend/src/entities/layout/model/types.ts`
- Create: `frontend/src/entities/layout/lib/edgePath.ts`
- Create: `frontend/src/entities/layout/lib/edgePath.test.ts`
- Modify: `frontend/src/entities/layout/index.ts`

- [ ] **Step 1: 실패하는 기하 테스트 작성**

`frontend/src/entities/layout/lib/edgePath.test.ts`:

```ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/entities/layout/lib/edgePath.test.ts`
Expected: FAIL — `Cannot find module './edgePath'`

- [ ] **Step 3: 타입 확장**

`frontend/src/entities/layout/model/types.ts` — `StoredLayout` 정의를 다음으로 교체하고 그 위에 두 타입을 추가:

```ts
/**
 * One manual edge path (ADR-0012): interior bend vertices in ABSOLUTE canvas
 * coords. Endpoints are NOT stored — they anchor to the column handles live,
 * so a table move stretches the end segments instead of detaching them.
 */
export interface StoredEdgePath {
  waypoints: XYPosition[]
}

/** Map of edge id -> manual path. Edge id == schemaToFlow's `${ref.id}#${i}`
 *  (name-based, so ADR-0004 keep/lose rules apply unchanged). */
export type EdgePaths = Record<string, StoredEdgePath>

/** The versioned object stored in project.layout JSONB. */
export interface StoredLayout {
  version: 1
  positions: LayoutPositions
  /** Manual edge paths (ADR-0012). Absent/empty = every edge auto-routed. */
  edges?: EdgePaths
}
```

- [ ] **Step 4: 기하 엔진 구현**

`frontend/src/entities/layout/lib/edgePath.ts`:

```ts
/**
 * PURE manual-edge-path geometry (ADR-0012). A manual path is stored as the
 * INTERIOR bend vertices (waypoints) of an orthogonal polyline; the endpoints
 * anchor to the live column handles. These helpers keep the CONTEXT.md
 * invariant — the path is ALWAYS orthogonal (axis-aligned segments only) —
 * by bridging non-aligned hops and merging re-aligned corners.
 *
 * entities layer: no React, no React Flow runtime (FSD downward imports).
 */
import type { XYPosition } from '@xyflow/react' // TYPE-ONLY import
import type { EdgePaths } from '../model/types'

export type PathPoint = XYPosition

const EPS = 0.5

function alignedX(a: PathPoint, b: PathPoint): boolean {
  return Math.abs(a.x - b.x) < EPS
}
function alignedY(a: PathPoint, b: PathPoint): boolean {
  return Math.abs(a.y - b.y) < EPS
}

/** Merge consecutive duplicate/collinear points (Q4: 직선화된 꺾임점 자동 병합). */
export function simplifyPath(pts: PathPoint[]): PathPoint[] {
  if (pts.length <= 2) return pts
  const out: PathPoint[] = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const dup = alignedX(a, b) && alignedY(a, b)
    const collinear = (alignedX(a, b) && alignedX(b, c)) || (alignedY(a, b) && alignedY(b, c))
    if (!dup && !collinear) out.push(b)
  }
  out.push(pts[pts.length - 1])
  return out
}

/**
 * Build the FULL orthogonal polyline: source + waypoints + target, with bridge
 * corners auto-inserted between any non-aligned consecutive pair. Bridging is
 * horizontal-first on every hop EXCEPT the final hop into the target, which is
 * vertical-first so the arrival segment stays horizontal (crow-foot markers
 * orient along the column row). For corner sequences produced by dragSegment
 * the bridging is a no-op; it only "repairs" after a table moved or a vertex
 * was edited numerically — which is exactly the dbdiagram stretch behavior.
 */
export function buildManualPath(
  source: PathPoint,
  target: PathPoint,
  waypoints: PathPoint[],
): PathPoint[] {
  const pts = [source, ...waypoints, target]
  const full: PathPoint[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const prev = full[full.length - 1]
    const next = pts[i]
    if (!alignedX(prev, next) && !alignedY(prev, next)) {
      const lastHop = i === pts.length - 1
      full.push(lastHop ? { x: prev.x, y: next.y } : { x: next.x, y: prev.y })
    }
    full.push(next)
  }
  return simplifyPath(full)
}

/**
 * Drag segment `segmentIndex` (between full[i] and full[i+1]) PERPENDICULAR to
 * its orientation: horizontal segments move to y=value, vertical to x=value.
 * A segment end that IS a path endpoint stays anchored — a stub corner is
 * inserted there instead (dbdiagram: dragging the first/last segment grows a
 * stub). Returns the new INTERIOR waypoint list (endpoints stripped), already
 * simplified (re-aligned corners merge away).
 */
export function dragSegment(
  full: PathPoint[],
  segmentIndex: number,
  value: number,
): PathPoint[] {
  const last = full.length - 1
  if (full.length < 2 || segmentIndex < 0 || segmentIndex >= last) {
    return full.slice(1, -1)
  }
  const a = full[segmentIndex]
  const b = full[segmentIndex + 1]
  const horizontal = alignedY(a, b)
  const moveP = (p: PathPoint): PathPoint =>
    horizontal ? { x: p.x, y: value } : { x: value, y: p.y }

  const out: PathPoint[] = []
  for (let i = 0; i < full.length; i++) {
    const p = full[i]
    if (i === segmentIndex) {
      if (i === 0) out.push(p, moveP(p)) // anchored source: stub corner
      else out.push(moveP(p))
    } else if (i === segmentIndex + 1) {
      if (i === last) out.push(moveP(p), p) // anchored target: stub corner
      else out.push(moveP(p))
    } else {
      out.push(p)
    }
  }
  return simplifyPath(out).slice(1, -1)
}

/**
 * Apply a single-axis edit of interior vertex `vertexIndex` (0-based within
 * the interior) from the Info panel. A vertex's x belongs to its VERTICAL
 * adjacent segment and its y to its HORIZONTAL one, so the edit reduces to
 * dragSegment on the axis-owning neighbor — canvas drag and panel edit share
 * one semantics (Q3 결정).
 */
export function editVertexAxis(
  full: PathPoint[],
  vertexIndex: number,
  axis: 'x' | 'y',
  value: number,
): PathPoint[] {
  const i = vertexIndex + 1 // interior index -> full-path index
  if (i <= 0 || i >= full.length - 1) return full.slice(1, -1)
  const prev = full[i - 1]
  const cur = full[i]
  // The adjacent segment that OWNS the edited axis is the one PERPENDICULAR to
  // it: x is owned by a vertical segment, y by a horizontal one.
  const prevOwns = axis === 'x' ? alignedX(prev, cur) : alignedY(prev, cur)
  const segIndex = prevOwns ? i - 1 : i
  return dragSegment(full, segIndex, value)
}

/** Drop manual paths whose edge no longer exists (GC at commit time, ADR-0012). */
export function pruneEdgePaths(
  paths: EdgePaths,
  validIds: ReadonlySet<string>,
): EdgePaths {
  const out: EdgePaths = {}
  for (const [id, p] of Object.entries(paths)) {
    if (validIds.has(id)) out[id] = p
  }
  return out
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/entities/layout/lib/edgePath.test.ts`
Expected: PASS (전체 케이스)

- [ ] **Step 6: index export 추가**

`frontend/src/entities/layout/index.ts`에 추가:

```ts
export {
  buildManualPath,
  dragSegment,
  editVertexAxis,
  simplifyPath,
  pruneEdgePaths,
  type PathPoint,
} from './lib/edgePath'
```

기존 **멀티라인** type export 블록(현재 `index.ts:4-8`, 항목별 줄바꿈 + 트레일링 콤마 형태)을 다음으로 교체 — 한 줄짜리 anchor로 Edit하면 매칭 실패하니 실제 파일의 멀티라인 텍스트를 anchor로 쓸 것:

```ts
export type {
  StoredPosition,
  LayoutPositions,
  StoredLayout,
  StoredEdgePath,
  EdgePaths,
} from './model/types'
```

- [ ] **Step 7: 타입 체크 + 커밋**

Run: `docker compose -p codegram exec -T frontend npm run type-check`
Expected: 에러 없음

```bash
git add frontend/src/entities/layout docs/adr/0012-manual-edge-paths-in-layout.md CONTEXT.md
git commit -m "feat(layout): manual edge path types + pure orthogonal geometry (ADR-0012)"
```
(CONTEXT.md의 수동 경로 용어 추가가 이 작업의 도메인 언어 기반이므로 함께 스테이징한다.)

---

### Task 2: 퍼시스턴스 배선 (useLayoutPersistence → autosave)

**Files:**
- Modify: `frontend/src/features/layout-persistence/api/useLayoutPersistence.ts`
- Modify: `frontend/src/features/layout-persistence/api/useLayoutPersistence.test.tsx` — **이미 존재한다. 새 .ts 파일을 만들지 말 것** (동일 basename 충돌)
- Modify: `frontend/src/pages/editor/index.test.tsx`

백엔드는 변경 불요: `project.layout`은 JSONB 통짜 저장이고 autosave는 `StoredLayout`을 JSON 직렬화 비교하므로 `edges` 필드가 자동으로 흘러간다.

- [ ] **Step 1: 실패하는 훅 테스트 추가**

기존 `frontend/src/features/layout-persistence/api/useLayoutPersistence.test.tsx` **끝에** 아래 describe 블록을 추가한다 (renderHook/act import는 기존 파일에 이미 있으면 재사용):

```ts
const seededLayout = {
  version: 1,
  positions: { 'public.users': { x: 10, y: 20 } },
  edges: { 'public.posts.(user_id)>public.users.(id)#0': { waypoints: [{ x: 50, y: 0 }] } },
}

describe('useLayoutPersistence — edge paths', () => {
  it('seeds edgePaths from project.layout.edges when the project loads', () => {
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useLayoutPersistence>[0]) =>
        useLayoutPersistence(props),
      { initialProps: { projectId: undefined, projectLayout: undefined } },
    )
    expect(result.current.edgePaths).toEqual({})

    rerender({ projectId: 'p1', projectLayout: seededLayout })
    expect(result.current.edgePaths).toEqual(seededLayout.edges)
    expect(result.current.layout.edges).toEqual(seededLayout.edges)
    expect(result.current.layoutBaseline.edges).toEqual(seededLayout.edges)
  })

  it('setEdgePaths updates layout (and not the baseline)', () => {
    const { result } = renderHook(() =>
      useLayoutPersistence({ projectId: 'p1', projectLayout: { version: 1, positions: {} } }),
    )
    act(() => {
      result.current.setEdgePaths({ 'e#0': { waypoints: [{ x: 1, y: 2 }] } })
    })
    expect(result.current.layout.edges).toEqual({ 'e#0': { waypoints: [{ x: 1, y: 2 }] } })
    expect(result.current.layoutBaseline.edges).toEqual({})
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/layout-persistence/api/useLayoutPersistence.test.tsx`
Expected: 새 describe만 FAIL — `edgePaths`가 결과에 없음 (기존 케이스는 아직 PASS)

- [ ] **Step 3: 훅 확장**

`frontend/src/features/layout-persistence/api/useLayoutPersistence.ts` 수정:

import에 `EdgePaths` 추가:
```ts
import type { EdgePaths, LayoutPositions, StoredLayout } from '@/entities/layout'
```

`UseLayoutPersistenceResult`에 추가:
```ts
  /** Live, editable manual edge paths (seeded from project, updated on edge edits). */
  edgePaths: EdgePaths
  /** Replace edge paths (called from ErdCanvas commit/reset). */
  setEdgePaths: (next: EdgePaths) => void
```

`readSeededPositions` 아래에 추가:
```ts
/** Read `edges` out of an arbitrary project.layout JSONB (missing -> {}). */
function readSeededEdges(
  projectLayout: Record<string, unknown> | undefined,
): EdgePaths {
  const edges = (projectLayout as Partial<StoredLayout> | undefined)?.edges
  return edges ?? {}
}
```

훅 본문 — 기존 두 useState 아래에 추가:
```ts
  const [edgePaths, setEdgePaths] = useState<EdgePaths>(() =>
    readSeededEdges(projectLayout),
  )
  const [baselineEdges, setBaselineEdges] = useState<EdgePaths>(() =>
    readSeededEdges(projectLayout),
  )
```

시드 effect 본문에 추가 (기존 `setPositions(seeded)` / `setBaselinePositions(seeded)` 다음):
```ts
    const seededEdges = readSeededEdges(projectLayout)
    setEdgePaths(seededEdges)
    setBaselineEdges(seededEdges)
```

두 memo를 교체:
```ts
  const layout = useMemo<StoredLayout>(
    () => ({ version: 1, positions, edges: edgePaths }),
    [positions, edgePaths],
  )
  const layoutBaseline = useMemo<StoredLayout>(
    () => ({ version: 1, positions: baselinePositions, edges: baselineEdges }),
    [baselinePositions, baselineEdges],
  )
```

return에 `edgePaths, setEdgePaths` 추가.

- [ ] **Step 4: 깨지는 기존 exact-shape 단언 갱신 (확정 사항 — '만약'이 아님)**

layout memo가 `edges`를 항상 포함하게 되므로 `toEqual({ version: 1, positions: … })` 형태의 단언은 **반드시** 깨진다 (vitest toEqual은 초과 키를 불일치로 본다). 다음 두 파일의 기대 객체에 `edges: {}`(시드에 edges가 없는 경우) 또는 시드한 edges 값을 추가:

1. `frontend/src/features/layout-persistence/api/useLayoutPersistence.test.tsx` — `toEqual({ version: 1, positions: …, })` 단언 5곳 (현재 :15-22, :30, :59, :100-103 부근; grep `version: 1`로 전수 확인)
2. `frontend/src/pages/editor/index.test.tsx` — 'seeds layout from project.layout.positions into the autosave layout' 케이스 (현재 :222-229)

- [ ] **Step 5: 테스트 통과 + 전체 단위 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/layout-persistence/api/useLayoutPersistence.test.tsx`
Expected: PASS (기존 + 신규 전부)

Run: `docker compose -p codegram exec -T frontend npm run test -- --run`
Expected: 전체 PASS

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/layout-persistence frontend/src/pages/editor/index.test.tsx
git commit -m "feat(layout-persistence): seed + persist manual edge paths through project.layout.edges"
```

---

### Task 3: 수동 경로 렌더링 (RelationEdge + ErdCanvas 표시 경로)

상호작용 없이 "저장된 waypoints가 있으면 그 경로로 그린다"까지만. 이 단계 후 layout JSONB에 손으로 넣은 경로가 화면에 반영된다.

**Files:**
- Modify: `frontend/src/entities/erd/model/types.ts`
- Modify: `frontend/src/features/erd-canvas/ui/RelationEdge.tsx`
- Modify: `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx`
- Modify: `frontend/src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx`

- [ ] **Step 1: 실패하는 wiring 테스트 추가**

`ErdCanvas.wiring.test.tsx` 끝에 추가 (이 파일의 `__rfProps` 모킹 패턴 그대로):

```tsx
describe('ErdCanvas manual edge paths — display wiring', () => {
  it('injects stored waypoints into the matching edge data', () => {
    const edgeId = 'public.posts.(user_id)>public.users.(id)#0'
    render(
      <ErdCanvas
        schema={schema}
        edgePaths={{ [edgeId]: { waypoints: [{ x: 50, y: 0 }, { x: 50, y: 100 }] } }}
      />,
    )
    const props = (globalThis as Record<string, unknown>).__rfProps as {
      edges: Array<{ id: string; data?: { waypoints?: Array<{ x: number; y: number }> } }>
    }
    const edge = props.edges.find((e) => e.id === edgeId)
    expect(edge?.data?.waypoints).toEqual([{ x: 50, y: 0 }, { x: 50, y: 100 }])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx`
Expected: FAIL — `edgePaths` prop 미존재 / waypoints undefined

- [ ] **Step 3: RelationEdgeData 타입 확장**

`frontend/src/entities/erd/model/types.ts` — import에 `XYPosition` 추가:
```ts
import type { Node, Edge, XYPosition } from '@xyflow/react'
```

`RelationEdgeData`에 필드 추가 (`active?` 아래):
```ts
  /** Manual path interior waypoints (ADR-0012). Present = skip auto routing. */
  waypoints?: XYPosition[]
  /** True when this edge is the current canvas selection (handles + reset UI). */
  isEdgeSelected?: boolean
```

- [ ] **Step 4: ErdCanvas에 edgePaths prop + 주입**

`ErdCanvas.tsx`:

import 추가:
```ts
import type { EdgePaths } from '@/entities/layout'
```

`ErdCanvasProps`에 추가:
```ts
  /** Manual edge paths to render (project.layout.edges). */
  edgePaths?: EdgePaths
```

`ErdCanvasInner`/`ErdCanvas` 시그니처에 `edgePaths` 전달 (둘 다 구조분해에 추가하고 `<ErdCanvasInner edgePaths={edgePaths} …>`로 통과).

`displayEdges` memo 교체:
```ts
  const displayEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        data: {
          ...e.data,
          active: activeEdgeIds.has(e.id),
          waypoints: edgePaths?.[e.id]?.waypoints,
        },
      })),
    [edges, activeEdgeIds, edgePaths],
  )
```

- [ ] **Step 5: RelationEdge 수동 경로 분기**

`RelationEdge.tsx` 수정:

import 교체:
```ts
import {
  routeOrthogonal,
  polylineToPath,
  type Rect,
} from '../lib/routeOrthogonal'
import { buildManualPath } from '@/entities/layout'
```

`RelationEdgeImpl` 본문 — `isEnumLink` 선언 아래에 추가:
```ts
  const manualWaypoints = data?.waypoints ?? null
```

`orthoPath` memo의 첫 가드와 명칭을 점 배열 반환형으로 교체:
```ts
  // Orthogonal route POINTS around the OTHER nodes. Null while dragging, for
  // enum links, and for manual-path edges (those render from stored waypoints).
  const orthoPoints = useMemo(() => {
    if (dragging || isEnumLink || manualWaypoints) return null
    const obstacles: Rect[] = []
    for (const n of nodeLookup.values()) {
      if (n.id === source || n.id === target) continue
      if (n.type !== 'table' && n.type !== 'enum' && n.type !== 'sticky') continue
      const pos = n.internals.positionAbsolute
      obstacles.push({
        x: pos.x,
        y: pos.y,
        width: n.measured?.width ?? 240,
        height: n.measured?.height ?? 80,
      })
    }
    return routeOrthogonal(
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
      sourcePosition === Position.Left ? 'left' : 'right',
      targetPosition === Position.Left ? 'left' : 'right',
      obstacles,
      undefined,
      laneIndex * LANE_GAP,
    )
  }, [
    dragging,
    isEnumLink,
    manualWaypoints,
    nodeLookup,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    laneIndex,
  ])

  // Manual path: stored waypoints + live endpoints, bridged to stay orthogonal.
  // Cheap (no A*), so it does NOT fall back to smoothstep during node drags —
  // the waypoints stay put and only the end segments stretch (dbdiagram 실측).
  const manualPoints = useMemo(() => {
    if (!manualWaypoints || isEnumLink) return null
    return buildManualPath(
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
      manualWaypoints,
    )
  }, [manualWaypoints, isEnumLink, sourceX, sourceY, targetX, targetY])
```

경로 선택부 교체 (`const edgePath = orthoPath ?? smoothPath` →):
```ts
  const routedPoints = manualPoints ?? orthoPoints
  const edgePath = routedPoints ? polylineToPath(routedPoints) : smoothPath
```

- [ ] **Step 6: 테스트 통과 + 전체 단위 + 타입 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas`
Expected: PASS

Run: `docker compose -p codegram exec -T frontend npm run type-check`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/entities/erd frontend/src/features/erd-canvas
git commit -m "feat(erd-canvas): render manual edge paths from stored waypoints, skipping A* routing"
```

---

### Task 4: 선택 모델 확장 (CanvasSelection — 테이블·Enum·스티키·엣지)

**Files:**
- Modify: `frontend/src/entities/erd/model/types.ts`
- Modify: `frontend/src/entities/erd/index.ts`
- Modify: `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx`
- Modify: `frontend/src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx`
- Modify: `frontend/src/pages/editor/index.tsx`

- [ ] **Step 1: 실패하는 wiring 테스트 — 기존 selection 케이스를 유니언으로 재작성**

`ErdCanvas.wiring.test.tsx`의 `describe('ErdCanvas Phase 5 — selection')` 블록 전체를 다음으로 교체:

```tsx
describe('ErdCanvas selection — CanvasSelection union', () => {
  it('onNodeClick on a table node fires onSelect with a node selection', () => {
    const onSelect = vi.fn()
    render(<ErdCanvas schema={schema} onSelect={onSelect} />)

    const props = (globalThis as Record<string, unknown>).__rfProps as {
      nodes: Array<{ id: string; type?: string; data: TableNodeData }>
      onNodeClick: (event: unknown, node: { id: string; type?: string; data: TableNodeData }) => void
    }
    const usersNode = props.nodes.find((n) => n.id === 'public.users')
    props.onNodeClick({}, usersNode!)

    expect(onSelect).toHaveBeenCalledWith({
      kind: 'node',
      nodeId: 'public.users',
      nodeType: 'table',
      tableName: 'users',
    })
  })

  it('onEdgeClick fires onSelect with an edge selection (enum links ignored)', () => {
    const onSelect = vi.fn()
    render(<ErdCanvas schema={schema} onSelect={onSelect} />)

    const props = (globalThis as Record<string, unknown>).__rfProps as {
      edges: Array<{ id: string; data?: { isEnumLink?: boolean } }>
      onEdgeClick: (event: unknown, edge: { id: string; data?: { isEnumLink?: boolean } }) => void
    }
    const relEdge = props.edges.find((e) => !e.data?.isEnumLink)!
    props.onEdgeClick({}, relEdge)
    expect(onSelect).toHaveBeenCalledWith({ kind: 'edge', edgeId: relEdge.id })

    onSelect.mockClear()
    props.onEdgeClick({}, { id: 'enumlink:x', data: { isEnumLink: true } })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('onPaneClick fires onSelect(null)', () => {
    const onSelect = vi.fn()
    render(<ErdCanvas schema={schema} onSelect={onSelect} />)
    const props = (globalThis as Record<string, unknown>).__rfProps as {
      onPaneClick: () => void
    }
    props.onPaneClick()
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('a table selection injects isSelected into the node data', () => {
    render(
      <ErdCanvas
        schema={schema}
        selection={{ kind: 'node', nodeId: 'public.users', nodeType: 'table', tableName: 'users' }}
      />,
    )
    const props = (globalThis as Record<string, unknown>).__rfProps as {
      nodes: Array<{ id: string; data: TableNodeData }>
    }
    expect(props.nodes.find((n) => n.id === 'public.users')?.data.isSelected).toBe(true)
    expect(props.nodes.find((n) => n.id === 'public.posts')?.data.isSelected).toBe(false)
  })

  it('an edge selection injects isEdgeSelected into the edge data', () => {
    const edgeId = 'public.posts.(user_id)>public.users.(id)#0'
    render(<ErdCanvas schema={schema} selection={{ kind: 'edge', edgeId }} />)
    const props = (globalThis as Record<string, unknown>).__rfProps as {
      edges: Array<{ id: string; data?: { isEdgeSelected?: boolean } }>
    }
    expect(props.edges.find((e) => e.id === edgeId)?.data?.isEdgeSelected).toBe(true)
  })

  // 기존 블록의 회귀 커버리지를 유니언 prop으로 변환해 보존한다 — 빠뜨리면
  // active-edge/column-highlight 배선이 무검증 상태가 된다.
  it('a table selection injects active=true into related edges', () => {
    render(
      <ErdCanvas
        schema={schema}
        selection={{ kind: 'node', nodeId: 'public.users', nodeType: 'table', tableName: 'users' }}
      />,
    )
    const props = (globalThis as Record<string, unknown>).__rfProps as {
      edges: Array<{ id: string; data?: { active?: boolean } }>
    }
    const rel = props.edges.find(
      (e) => e.id === 'public.posts.(user_id)>public.users.(id)#0',
    )
    expect(rel?.data?.active).toBe(true)
  })

  it('a table selection injects highlightedColumnIds into both endpoints', () => {
    render(
      <ErdCanvas
        schema={schema}
        selection={{ kind: 'node', nodeId: 'public.users', nodeType: 'table', tableName: 'users' }}
      />,
    )
    const props = (globalThis as Record<string, unknown>).__rfProps as {
      nodes: Array<{ id: string; data: TableNodeData }>
    }
    expect(
      props.nodes.find((n) => n.id === 'public.users')?.data.highlightedColumnIds,
    ).toContain('public.users.id')
    expect(
      props.nodes.find((n) => n.id === 'public.posts')?.data.highlightedColumnIds,
    ).toContain('public.posts.user_id')
  })
})
```

주의: 교체 대상 블록(현재 :66-144)에 들어 있던 active-edge/highlightedColumnIds 케이스는 위 교체 블록에 유니언 형태로 **이미 포함**되어 있다 — 별도 치환 작업 없음. 교체 후 파일에 `selected="users"` 사용처가 남아 있지 않은지 확인.

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx`
Expected: FAIL — `selection`/`onSelect`/`onEdgeClick` 미배선

- [ ] **Step 3: CanvasSelection 타입 정의**

`frontend/src/entities/erd/model/types.ts` 끝에 추가:

```ts
/**
 * Canvas selection (단일 선택 모델, Q3 가정): a directly-placeable node
 * (table/enum/sticky — group boxes are derived, not selectable for coords),
 * a relation edge, or nothing. Enum-link edges are never selectable (Q4).
 */
export type CanvasSelection =
  | {
      kind: 'node'
      nodeId: string
      nodeType: 'table' | 'enum' | 'sticky'
      /** Set for tables — drives the legacy name-based highlight + editor scroll. */
      tableName?: string
    }
  | { kind: 'edge'; edgeId: string }
  | null
```

`frontend/src/entities/erd/index.ts`에 추가:
```ts
export type { CanvasSelection } from './model/types'
```

- [ ] **Step 4: ErdCanvas — selected/onSelectNode를 selection/onSelect로 교체**

`ErdCanvas.tsx` 수정:

import에 `CanvasSelection`, `RelationEdgeData` 추가:
```ts
import { schemaToFlow, type ErdFlowNode, type TableNodeData, type ErdColumn, type CanvasSelection, type RelationEdgeData } from '@/entities/erd'
```

`ErdCanvasProps`에서 `selected?: string | null` / `onSelectNode?: …` 두 항목을 제거하고 교체:
```ts
  /**
   * Current canvas selection (node or edge). Drives node ring, active edges,
   * column highlights, edge handles — positions are never touched.
   */
  selection?: CanvasSelection
  /** Fires on node/edge click (union) and on pane click (null). */
  onSelect?: (selection: CanvasSelection) => void
```

`ErdCanvasInner` 본문 — 파생 셀렉터 추가 (highlight memo들 위):
```ts
  const selectedTableName =
    selection?.kind === 'node' && selection.nodeType === 'table'
      ? selection.tableName ?? null
      : null
  const selectedEdgeId = selection?.kind === 'edge' ? selection.edgeId : null
```

기존 `selected` 사용처 3곳을 `selectedTableName`으로 치환:
- `computeHighlightColIds(schema, selectedTableName)`
- `computeActiveEdgeIds(schema, selectedTableName)`
- `displayNodes`의 `isSelected: data.tableName === selectedTableName` (memo deps도 `selected` → `selectedTableName`)

`displayEdges` memo에 선택 주입 추가:
```ts
          waypoints: edgePaths?.[e.id]?.waypoints,
          isEdgeSelected: e.id === selectedEdgeId,
```
(deps에 `selectedEdgeId` 추가)

`<ReactFlow>` 핸들러 교체:
```tsx
      onNodeClick={(_, node) => {
        if (node.type === 'table') {
          onSelect?.({
            kind: 'node',
            nodeId: node.id,
            nodeType: 'table',
            tableName: (node.data as TableNodeData).tableName,
          })
        } else if (node.type === 'enum' || node.type === 'sticky') {
          onSelect?.({ kind: 'node', nodeId: node.id, nodeType: node.type })
        }
      }}
      onEdgeClick={(_, edge) => {
        if ((edge.data as RelationEdgeData | undefined)?.isEnumLink) return
        onSelect?.({ kind: 'edge', edgeId: edge.id })
      }}
      onPaneClick={() => onSelect?.(null)}
```

바깥 `ErdCanvas` 래퍼의 구조분해/전달도 `selected`/`onSelectNode` → `selection`/`onSelect`로 교체.

- [ ] **Step 5: 에디터 페이지 배선 교체**

`frontend/src/pages/editor/index.tsx` 수정:

import에 `CanvasSelection` 추가 (기존 `@/entities/dbml` import와 별개로):
```ts
import type { CanvasSelection } from '@/entities/erd'
```

기존 `const [selected, setSelected] = useState<string | null>(null)`을 교체:
```ts
  // 단일 선택 모델: 노드(테이블/Enum/스티키) 또는 엣지 하나만 선택된다.
  const [selection, setSelection] = useState<CanvasSelection>(null)
  // 레거시 이름 기반 파생값 — DbmlEditor 스크롤 + 패널 리스트 하이라이트용.
  const selected =
    selection?.kind === 'node' && selection.nodeType === 'table'
      ? selection.tableName ?? null
      : null

  // 패널의 Table names 리스트는 이름으로 선택한다 → 노드 선택으로 변환.
  function selectTableByName(name: string) {
    const t = schema?.tables.find((tb) => tb.name === name)
    setSelection(
      t ? { kind: 'node', nodeId: t.id, nodeType: 'table', tableName: t.name } : null,
    )
  }
```

`<ErdCanvas …>` props 교체: `selected={selected} onSelectNode={setSelected}` → `selection={selection} onSelect={setSelection}` (+ Task 3의 `edgePaths={edgePaths}`도 이때 함께: `useLayoutPersistence` 구조분해에 `edgePaths, setEdgePaths` 추가).

`<ErdInfoPanel … onSelect={setSelected}>` → `onSelect={selectTableByName}`.

- [ ] **Step 6: 잔여 참조 제거 확인 + 전체 단위 + 타입**

Run: `grep -rn "onSelectNode" frontend/src; grep -rn "selected=" frontend/src/features/erd-canvas`
Expected: **둘 다 0건.** (패널의 이름 기반 `selected={selected}`는 pages/editor와 ErdInfoPanel에 **의도적으로 남는다** — 검사 범위 밖이므로 건드리지 말 것. DbmlEditor의 `selectedTable`도 무관하므로 유지)

Run: `docker compose -p codegram exec -T frontend npm run test -- --run`
Expected: 전체 PASS (`pages/editor/index.test.tsx`가 `onSelectNode`를 참조하면 위 유니언 패턴으로 동일하게 갱신)

Run: `docker compose -p codegram exec -T frontend npm run type-check`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add frontend/src
git commit -m "feat(erd-canvas): CanvasSelection union — table/enum/sticky/edge selection with enum-link guard"
```

---

### Task 5: 세그먼트 드래그 + Reset line (캔버스 상호작용)

**Files:**
- Create: `frontend/src/features/erd-canvas/lib/edgePathContext.ts`
- Modify: `frontend/src/features/erd-canvas/ui/RelationEdge.tsx`
- Modify: `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx`
- Modify: `frontend/src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx`

- [ ] **Step 1: 컨텍스트 정의**

`frontend/src/features/erd-canvas/lib/edgePathContext.ts`:

```ts
/**
 * Edge -> canvas communication for manual paths. RelationEdge components live
 * inside React Flow's renderer, so callbacks flow through context (stable
 * identity via refs in the provider) instead of per-edge data props.
 * features layer (FSD): local to erd-canvas.
 */
import { createContext, useContext } from 'react'
import type { PathPoint } from '@/entities/layout'

export interface EdgePathContextValue {
  /** Commit a new manual path for the edge (drag end / panel edit). */
  commitWaypoints: (edgeId: string, waypoints: PathPoint[]) => void
  /** Remove the manual path — the edge returns to auto routing (Reset line). */
  resetPath: (edgeId: string) => void
  /**
   * Report the currently-RENDERED full polyline of a selected edge so the
   * canvas can expose it (SelectionInfo waypoints + panel edits on auto paths).
   */
  reportPath: (edgeId: string, full: PathPoint[]) => void
}

const noop = () => {}

export const EdgePathContext = createContext<EdgePathContextValue>({
  commitWaypoints: noop,
  resetPath: noop,
  reportPath: noop,
})

export function useEdgePathContext(): EdgePathContextValue {
  return useContext(EdgePathContext)
}
```

- [ ] **Step 2: ErdCanvas — 커밋/리셋/보고 배선 + provider**

`ErdCanvas.tsx` 수정:

import 추가:
```ts
import { pruneEdgePaths, type EdgePaths, type PathPoint } from '@/entities/layout'
import { EdgePathContext, type EdgePathContextValue } from '../lib/edgePathContext'
```

`ErdCanvasProps`에 추가:
```ts
  /** Fired when manual edge paths change (drag commit, reset, auto-arrange clear). */
  onEdgePathsChange?: (next: EdgePaths) => void
```
(`ErdCanvasInner`/`ErdCanvas` 구조분해·전달에 추가)

`ErdCanvasInner` 본문 — `nodesRef.current = nodes` 줄 **바로 아래**에 삽입한다. **위치가 중요하다**: 기존 captureReady useEffect(현재 :314-318)보다 반드시 **위**여야 한다 — Task 6이 그 effect의 deps에 `edgePathCtx`를 추가하므로, 선언이 effect 아래에 있으면 deps 배열 평가 시점에 TDZ ReferenceError로 모든 렌더가 죽는다:
```ts
  // Latest values for the stable edge-path context callbacks (no stale closures).
  const edgePathsRef = useRef<EdgePaths>(edgePaths ?? {})
  edgePathsRef.current = edgePaths ?? {}
  const flowEdgeIdsRef = useRef<Set<string>>(new Set())
  flowEdgeIdsRef.current = new Set(flow.edges.map((e) => e.id))
  const onEdgePathsChangeRef = useRef(onEdgePathsChange)
  onEdgePathsChangeRef.current = onEdgePathsChange

  // Rendered full polyline of the SELECTED edge, reported by RelationEdge.
  // Drives SelectionInfo waypoints and panel edits on auto-routed edges.
  const [reportedPath, setReportedPath] = useState<{
    id: string
    points: PathPoint[]
  } | null>(null)
  const reportedPathRef = useRef(reportedPath)
  reportedPathRef.current = reportedPath

  // Commit prunes orphans (edges that no longer exist) per ADR-0012.
  const edgePathCtx = useMemo<EdgePathContextValue>(
    () => ({
      commitWaypoints: (edgeId, waypoints) => {
        const rounded = waypoints.map((p) => ({
          x: Math.round(p.x),
          y: Math.round(p.y),
        }))
        onEdgePathsChangeRef.current?.(
          pruneEdgePaths(
            { ...edgePathsRef.current, [edgeId]: { waypoints: rounded } },
            flowEdgeIdsRef.current,
          ),
        )
      },
      resetPath: (edgeId) => {
        const next = { ...edgePathsRef.current }
        delete next[edgeId]
        onEdgePathsChangeRef.current?.(
          pruneEdgePaths(next, flowEdgeIdsRef.current),
        )
      },
      reportPath: (edgeId, points) => {
        setReportedPath((prev) =>
          prev?.id === edgeId && JSON.stringify(prev.points) === JSON.stringify(points)
            ? prev
            : { id: edgeId, points },
        )
      },
    }),
    [],
  )
```

`handleAutoArrange`에 한 줄 추가 (`onLayoutChange?.(…)` 다음):
```ts
    // Auto-arrange recomputes every position — stale manual paths are cleared (ADR-0012).
    onEdgePathsChange?.({})
```

JSX: `<ReactFlow …>` 전체를 provider로 감싼다:
```tsx
    <EdgePathContext.Provider value={edgePathCtx}>
      <ReactFlow …기존 그대로…>
        …
      </ReactFlow>
    </EdgePathContext.Provider>
```

- [ ] **Step 3: RelationEdge — 핸들 + 드래그 + Reset 버튼 (파일 하단 절반 교체)**

`RelationEdge.tsx` 수정:

import 교체/추가:
```ts
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  useStore,
  Position,
  type EdgeProps,
} from '@xyflow/react'
import { RotateCw } from 'lucide-react'
import {
  buildManualPath,
  dragSegment,
  type PathPoint,
} from '@/entities/layout'
import { useEdgePathContext } from '../lib/edgePathContext'
```

`RelationEdgeImpl` 본문 — Task 3의 `manualPoints` memo 아래에 추가:

```ts
  const isEdgeSelected = (data?.isEdgeSelected ?? false) && !isEnumLink
  const ctx = useEdgePathContext()
  const { screenToFlowPosition } = useReactFlow()

  // Live drag draft: interior waypoints while a segment handle is being
  // dragged. Geometry is computed from the path CAPTURED at pointerdown (not
  // the draft) so the dragged segment's index never shifts under the pointer.
  const [draftWaypoints, setDraftWaypoints] = useState<PathPoint[] | null>(null)
  const dragStateRef = useRef<{ full: PathPoint[]; segmentIndex: number } | null>(null)

  const draftPoints = useMemo(() => {
    if (!draftWaypoints) return null
    return buildManualPath(
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
      draftWaypoints,
    )
  }, [draftWaypoints, sourceX, sourceY, targetX, targetY])

  // The polyline actually rendered this frame (draft > manual > auto).
  const renderedPoints = draftPoints ?? manualPoints ?? orthoPoints

  // Report the rendered path while selected — feeds SelectionInfo + panel
  // edits (auto edges have no stored waypoints; the canvas needs this copy).
  useEffect(() => {
    if (isEdgeSelected && renderedPoints) {
      ctx.reportPath(id, renderedPoints)
    }
  }, [isEdgeSelected, renderedPoints, ctx, id])

  function onHandlePointerDown(e: React.PointerEvent, segmentIndex: number) {
    if (!renderedPoints) return
    e.stopPropagation()
    e.preventDefault()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragStateRef.current = { full: renderedPoints.map((p) => ({ ...p })), segmentIndex }
  }
  function onHandlePointerMove(e: React.PointerEvent) {
    const st = dragStateRef.current
    if (!st) return
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const a = st.full[st.segmentIndex]
    const b = st.full[st.segmentIndex + 1]
    const horizontal = Math.abs(a.y - b.y) < 0.5
    setDraftWaypoints(
      dragSegment(st.full, st.segmentIndex, horizontal ? flowPos.y : flowPos.x),
    )
  }
  function onHandlePointerUp() {
    const st = dragStateRef.current
    dragStateRef.current = null
    if (st && draftWaypoints) {
      ctx.commitWaypoints(id, draftWaypoints)
    }
    setDraftWaypoints(null)
  }
```

기존 `const edgePath = …` 줄을 교체:
```ts
  const edgePath = renderedPoints ? polylineToPath(renderedPoints) : smoothPath
```

return JSX — `<BaseEdge …/>` 뒤에(같은 fragment 안) 추가:

```tsx
      {isEdgeSelected && renderedPoints && (
        <g data-testid="edge-handles">
          {/* Anchored endpoints — visual only (끝점은 컬럼에 앵커, 편집 불가) */}
          <circle
            cx={renderedPoints[0].x}
            cy={renderedPoints[0].y}
            r={3.5}
            style={{ fill: 'var(--erd-accent)', pointerEvents: 'none' }}
          />
          <circle
            cx={renderedPoints[renderedPoints.length - 1].x}
            cy={renderedPoints[renderedPoints.length - 1].y}
            r={3.5}
            style={{ fill: 'var(--erd-accent)', pointerEvents: 'none' }}
          />
          {/* Interior corner dots — visual markers (드래그는 세그먼트 핸들로) */}
          {renderedPoints.slice(1, -1).map((p, i) => (
            <circle
              key={`c${i}`}
              cx={p.x}
              cy={p.y}
              r={3}
              style={{ fill: 'var(--erd-surface)', stroke: 'var(--erd-accent)', strokeWidth: 1.5, pointerEvents: 'none' }}
            />
          ))}
          {/* Segment midpoint DRAG handles (dbdiagram 실측 모델) */}
          {renderedPoints.slice(0, -1).map((p, i) => {
            const q = renderedPoints[i + 1]
            const len = Math.abs(q.x - p.x) + Math.abs(q.y - p.y)
            if (len < 12) return null // 너무 짧은 세그먼트는 핸들 생략
            const horizontal = Math.abs(p.y - q.y) < 0.5
            return (
              <circle
                key={`s${i}`}
                data-testid={`edge-seg-${i}`}
                cx={(p.x + q.x) / 2}
                cy={(p.y + q.y) / 2}
                r={5}
                style={{
                  fill: 'var(--erd-surface)',
                  stroke: 'var(--erd-accent)',
                  strokeWidth: 1.5,
                  cursor: horizontal ? 'ns-resize' : 'ew-resize',
                  // React Flow v12: .react-flow__edge { pointer-events: visibleStroke }
                  // 를 상속하면 1.5px 링만 클릭된다 — 채움 영역 전체를 히트 대상으로.
                  pointerEvents: 'all',
                }}
                onPointerDown={(e) => onHandlePointerDown(e, i)}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
              />
            )
          })}
        </g>
      )}
      {isEdgeSelected && manualWaypoints && renderedPoints && (
        <EdgeLabelRenderer>
          {(() => {
            const mid = renderedPoints[Math.floor(renderedPoints.length / 2)]
            return (
              <button
                data-testid="edge-reset"
                title="Reset line"
                onClick={() => ctx.resetPath(id)}
                style={{
                  position: 'absolute',
                  transform: `translate(-50%, -50%) translate(${mid.x + 18}px, ${mid.y - 18}px)`,
                  pointerEvents: 'all',
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  border: '1px solid var(--erd-border-2)',
                  background: 'var(--erd-surface)',
                  color: 'var(--erd-accent)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'var(--erd-shadow-sm)',
                }}
              >
                <RotateCw size={14} strokeWidth={2} />
              </button>
            )
          })()}
        </EdgeLabelRenderer>
      )}
```

- [ ] **Step 4: wiring 테스트 — 커밋/오토어레인지 경로 삭제**

`ErdCanvas.wiring.test.tsx`에 추가:

```tsx
describe('ErdCanvas manual edge paths — commit & clear', () => {
  it('Auto-arrange clears all manual paths via onEdgePathsChange({})', async () => {
    const onEdgePathsChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ErdCanvas
        schema={schema}
        edgePaths={{ 'public.posts.(user_id)>public.users.(id)#0': { waypoints: [{ x: 1, y: 2 }] } }}
        onEdgePathsChange={onEdgePathsChange}
      />,
    )
    await user.click(screen.getByRole('button', { name: /auto-arrange/i }))
    expect(onEdgePathsChange).toHaveBeenCalledWith({})
  })
})
```

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx`
Expected: PASS (실패 시 Step 2의 handleAutoArrange 수정 확인)

- [ ] **Step 5: 전체 단위 + 타입 + 커밋**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run && docker compose -p codegram exec -T frontend npm run type-check`
Expected: PASS / 에러 없음

```bash
git add frontend/src/features/erd-canvas
git commit -m "feat(erd-canvas): segment-drag manual rerouting + Reset line button (dbdiagram parity)"
```

---

### Task 6: SelectionInfo 보고 + 캡처 핸들 편집 API

**Files:**
- Modify: `frontend/src/entities/erd/model/types.ts`
- Modify: `frontend/src/entities/erd/index.ts`
- Modify: `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx`
- Modify: `frontend/src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx`
- Modify: `frontend/src/pages/editor/index.tsx`
- Modify: `frontend/src/pages/editor/index.test.tsx` (캡처 핸들 목 3곳)

- [ ] **Step 1: SelectionInfo 타입**

`frontend/src/entities/erd/model/types.ts` 끝에 추가:

```ts
/** Coordinate info the canvas reports for the current selection (Info 패널 표시용).
 *  All coords are ABSOLUTE canvas coords, rounded to integers (Q3 결정). */
export interface NodeSelectionInfo {
  kind: 'node'
  nodeId: string
  nodeType: 'table' | 'enum' | 'sticky'
  label: string
  x: number
  y: number
}
export interface EdgeSelectionInfo {
  kind: 'edge'
  edgeId: string
  /** e.g. `posts.user_id → users.id` (schema prefix stripped). */
  label: string
  /** True when the edge has a stored manual path. */
  manual: boolean
  /** INTERIOR bend vertices of the rendered path (끝점 제외 — 편집 불가). */
  waypoints: XYPosition[]
}
export type SelectionInfo = NodeSelectionInfo | EdgeSelectionInfo
```

`frontend/src/entities/erd/index.ts`에 추가:
```ts
export type { SelectionInfo, NodeSelectionInfo, EdgeSelectionInfo } from './model/types'
```

- [ ] **Step 2: 실패하는 wiring 테스트**

`ErdCanvas.wiring.test.tsx`에 추가:

```tsx
describe('ErdCanvas selection info reporting', () => {
  it('reports node info (absolute coords) for a selected table', async () => {
    const onSelectionInfo = vi.fn()
    render(
      <ErdCanvas
        schema={schema}
        savedPositions={{ 'public.users': { x: 320, y: 80 } }}
        selection={{ kind: 'node', nodeId: 'public.users', nodeType: 'table', tableName: 'users' }}
        onSelectionInfo={onSelectionInfo}
      />,
    )
    await vi.waitFor(() => {
      expect(onSelectionInfo).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'node', nodeId: 'public.users', label: 'users', x: 320, y: 80 }),
      )
    })
  })

  it('reports null when nothing is selected', async () => {
    const onSelectionInfo = vi.fn()
    render(<ErdCanvas schema={schema} onSelectionInfo={onSelectionInfo} />)
    await vi.waitFor(() => {
      expect(onSelectionInfo).toHaveBeenCalledWith(null)
    })
  })
})
```

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx`
Expected: FAIL — `onSelectionInfo` 미구현

- [ ] **Step 3: ErdCanvas — 보고 effect + 캡처 핸들 확장**

`ErdCanvas.tsx` 수정:

import에 `SelectionInfo`, `editVertexAxis`, `XYPosition` 추가:
```ts
import { schemaToFlow, type ErdFlowNode, type TableNodeData, type ErdColumn, type CanvasSelection, type RelationEdgeData, type SelectionInfo } from '@/entities/erd'
import { pruneEdgePaths, editVertexAxis, type EdgePaths, type PathPoint } from '@/entities/layout'
import type { XYPosition } from '@xyflow/react'
```

`ErdCanvasProps`에 추가:
```ts
  /** Fired (guarded by value-equality) with coordinate info for the selection. */
  onSelectionInfo?: (info: SelectionInfo | null) => void
```

`ErdCaptureHandle` 확장:
```ts
export interface ErdCaptureHandle {
  fitView: () => void
  getInstance: () => Pick<ReactFlowInstance, 'getNodes' | 'getNodesBounds'>
  /** Info 패널 좌표 편집: 절대좌표를 받아 노드를 이동하고 레이아웃을 커밋한다. */
  setNodePositionAbs: (nodeId: string, pos: XYPosition) => void
  /** Info 패널 꺾임점 축 편집 — 현재 선택된 엣지에만 유효 (reportedPath 기반). */
  setEdgeWaypoint: (edgeId: string, vertexIndex: number, axis: 'x' | 'y', value: number) => void
  /** Reset line — 수동 경로 제거. */
  resetEdgePath: (edgeId: string) => void
}
```

**전달 누락 주의**: 외부 `ErdCanvas` 래퍼는 props를 스프레드 없이 **하나씩 명시 전달**한다(현재 :504, :540-548). `onSelectionInfo`를 래퍼와 `ErdCanvasInner` **양쪽** 구조분해에 추가하고 `<ErdCanvasInner onSelectionInfo={onSelectionInfo} …>`로 전달할 것 — 빠뜨리면 Inner에서 `undefined`라 보고 effect가 영원히 bail하고 Step 2의 두 테스트가 `vi.waitFor` 타임아웃으로 죽는다.

`ErdCanvasInner` — 구현 함수 + ref 미러 (`captureReadyFiredRef` effect 위):
```ts
  function setNodePositionAbsImpl(nodeId: string, pos: XYPosition) {
    const current = nodesRef.current
    const node = current.find((n) => n.id === nodeId)
    if (!node || node.type === 'group') return // 그룹 박스는 파생 — 편집 불가 (Q3)
    let rel = pos
    if (node.parentId) {
      const parent = current.find((n) => n.id === node.parentId)
      if (parent) rel = { x: pos.x - parent.position.x, y: pos.y - parent.position.y }
    }
    const next = current.map((n) =>
      n.id === nodeId
        ? { ...n, position: { x: Math.round(rel.x), y: Math.round(rel.y) } }
        : n,
    )
    setNodes(next)
    onLayoutChange?.(nodesToLayout(next))
  }
  function setEdgeWaypointImpl(
    edgeId: string,
    vertexIndex: number,
    axis: 'x' | 'y',
    value: number,
  ) {
    const rp = reportedPathRef.current
    if (!rp || rp.id !== edgeId) return
    // 패널 편집 = 축을 소유한 인접 세그먼트의 드래그 (캔버스 드래그와 동일 의미).
    // 자동 경로 엣지를 편집하면 이 커밋으로 수동 경로가 된다 (Q3 결정).
    edgePathCtx.commitWaypoints(edgeId, editVertexAxis(rp.points, vertexIndex, axis, value))
  }
  const setNodePositionAbsRef = useRef(setNodePositionAbsImpl)
  setNodePositionAbsRef.current = setNodePositionAbsImpl
  const setEdgeWaypointRef = useRef(setEdgeWaypointImpl)
  setEdgeWaypointRef.current = setEdgeWaypointImpl
```

`onCaptureReady` 호출 객체 교체 (한 번만 fire되므로 ref 위임):
```ts
    onCaptureReady?.({
      fitView,
      getInstance: () => rf,
      setNodePositionAbs: (nodeId, pos) => setNodePositionAbsRef.current(nodeId, pos),
      setEdgeWaypoint: (edgeId, i, axis, v) => setEdgeWaypointRef.current(edgeId, i, axis, v),
      resetEdgePath: (edgeId) => edgePathCtx.resetPath(edgeId),
    })
```
(`edgePathCtx`는 `useMemo(..., [])`라 안정 — deps 추가: `[fitView, rf, onCaptureReady, edgePathCtx]`)

보고 effect (`displayEdges` memo 아래):
```ts
  // Report coordinate info for the current selection — value-equality guarded
  // so identical re-computations don't loop the page state.
  const lastInfoKeyRef = useRef('')
  useEffect(() => {
    if (!onSelectionInfo) return
    let info: SelectionInfo | null = null
    if (selection?.kind === 'edge') {
      const e = flow.edges.find((x) => x.id === selection.edgeId)
      if (e) {
        const part = (h: string | null | undefined, fallback: string) =>
          (h ?? fallback).split('.').slice(1).join('.') || (h ?? fallback)
        const rp = reportedPath && reportedPath.id === e.id ? reportedPath.points : null
        const stored = edgePaths?.[e.id]?.waypoints
        const interior = rp ? rp.slice(1, -1) : stored ?? []
        info = {
          kind: 'edge',
          edgeId: e.id,
          label: `${part(e.sourceHandle, e.source)} → ${part(e.targetHandle, e.target)}`,
          manual: !!stored,
          waypoints: interior.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
        }
      }
    } else if (selection?.kind === 'node') {
      const n = nodes.find((x) => x.id === selection.nodeId)
      if (n) {
        const parent = n.parentId ? nodes.find((x) => x.id === n.parentId) : undefined
        const abs = parent
          ? { x: parent.position.x + n.position.x, y: parent.position.y + n.position.y }
          : n.position
        const d = n.data as Record<string, unknown>
        info = {
          kind: 'node',
          nodeId: n.id,
          nodeType: selection.nodeType,
          label: String(d.tableName ?? d.enumName ?? d.title ?? n.id),
          x: Math.round(abs.x),
          y: Math.round(abs.y),
        }
      }
    }
    const key = JSON.stringify(info)
    if (key !== lastInfoKeyRef.current) {
      lastInfoKeyRef.current = key
      onSelectionInfo(info)
    }
  }, [selection, nodes, flow.edges, edgePaths, reportedPath, onSelectionInfo])
```

- [ ] **Step 4: 페이지 배선**

`frontend/src/pages/editor/index.tsx`:

import 갱신:
```ts
import type { CanvasSelection, SelectionInfo } from '@/entities/erd'
```

상태 추가 (selection 아래):
```ts
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null)
```

`<ErdCanvas …>`에 props 추가:
```tsx
            edgePaths={edgePaths}
            onEdgePathsChange={setEdgePaths}
            onSelectionInfo={setSelectionInfo}
```
(`useLayoutPersistence` 구조분해에 `edgePaths, setEdgePaths`가 Task 4에서 이미 추가됐는지 확인)

`frontend/src/pages/editor/index.test.tsx` — 캡처 핸들 목 3곳(현재 :337-340, :607-610, :740-743)이 `{ fitView, getInstance }`만 구현하므로 `ErdCaptureHandle` 확장으로 **type-check가 반드시 깨진다**. 세 곳 모두 다음으로 교체:
```ts
props.onCaptureReady?.({
  fitView: () => {},
  getInstance: () => null as never,
  setNodePositionAbs: () => {},
  setEdgeWaypoint: () => {},
  resetEdgePath: () => {},
})
```

- [ ] **Step 5: 테스트 + 타입 + 커밋**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run && docker compose -p codegram exec -T frontend npm run type-check`
Expected: PASS / 에러 없음

```bash
git add frontend/src
git commit -m "feat(erd-canvas): SelectionInfo reporting + imperative coord-edit API on the capture handle"
```

---

### Task 7: Info 패널 Selection 섹션

**Files:**
- Create: `frontend/src/widgets/erd-info-panel/ui/SelectionSection.tsx`
- Create: `frontend/src/widgets/erd-info-panel/ui/SelectionSection.test.tsx`
- Modify: `frontend/src/widgets/erd-info-panel/ui/ErdInfoPanel.tsx`
- Modify: `frontend/src/pages/editor/index.tsx`

- [ ] **Step 1: 실패하는 섹션 테스트**

`frontend/src/widgets/erd-info-panel/ui/SelectionSection.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelectionSection } from './SelectionSection'

const nodeInfo = {
  kind: 'node' as const,
  nodeId: 'public.users',
  nodeType: 'table' as const,
  label: 'users',
  x: 320,
  y: 80,
}
const edgeInfo = {
  kind: 'edge' as const,
  edgeId: 'public.posts.(user_id)>public.users.(id)#0',
  label: 'posts.user_id → users.id',
  manual: true,
  waypoints: [{ x: 50, y: 0 }, { x: 50, y: 100 }],
}

describe('SelectionSection — node', () => {
  it('shows editable x/y and commits a numeric edit on Enter', async () => {
    const onEditNodePosition = vi.fn()
    const user = userEvent.setup()
    render(
      <SelectionSection
        info={nodeInfo}
        onEditNodePosition={onEditNodePosition}
        onEditEdgeWaypoint={vi.fn()}
        onResetEdgePath={vi.fn()}
      />,
    )
    expect(screen.getByText('users')).toBeInTheDocument()
    const x = screen.getByTestId('sel-x')
    expect(x).toHaveValue('320')
    await user.clear(x)
    await user.type(x, '600{Enter}')
    expect(onEditNodePosition).toHaveBeenCalledWith('public.users', { x: 600, y: 80 })
  })
})

describe('SelectionSection — edge', () => {
  it('lists waypoints and commits a single-axis edit', async () => {
    const onEditEdgeWaypoint = vi.fn()
    const user = userEvent.setup()
    render(
      <SelectionSection
        info={edgeInfo}
        onEditNodePosition={vi.fn()}
        onEditEdgeWaypoint={onEditEdgeWaypoint}
        onResetEdgePath={vi.fn()}
      />,
    )
    expect(screen.getByText('posts.user_id → users.id')).toBeInTheDocument()
    expect(screen.getByText('Manual')).toBeInTheDocument()
    const wp0x = screen.getByTestId('wp-0-x')
    expect(wp0x).toHaveValue('50')
    await user.clear(wp0x)
    await user.type(wp0x, '70{Enter}')
    expect(onEditEdgeWaypoint).toHaveBeenCalledWith(edgeInfo.edgeId, 0, 'x', 70)
  })

  it('shows Reset line for manual paths and fires the callback', async () => {
    const onResetEdgePath = vi.fn()
    const user = userEvent.setup()
    render(
      <SelectionSection
        info={edgeInfo}
        onEditNodePosition={vi.fn()}
        onEditEdgeWaypoint={vi.fn()}
        onResetEdgePath={onResetEdgePath}
      />,
    )
    await user.click(screen.getByTestId('edge-reset-panel'))
    expect(onResetEdgePath).toHaveBeenCalledWith(edgeInfo.edgeId)
  })

  it('hides Reset line for auto paths', () => {
    render(
      <SelectionSection
        info={{ ...edgeInfo, manual: false }}
        onEditNodePosition={vi.fn()}
        onEditEdgeWaypoint={vi.fn()}
        onResetEdgePath={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('edge-reset-panel')).toBeNull()
    expect(screen.getByText('Auto')).toBeInTheDocument()
  })
})
```

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/widgets/erd-info-panel/ui/SelectionSection.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 2: SelectionSection 구현**

`frontend/src/widgets/erd-info-panel/ui/SelectionSection.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { RotateCw } from 'lucide-react'
import type { SelectionInfo } from '@/entities/erd'

export interface SelectionSectionProps {
  info: SelectionInfo
  /** 절대좌표 커밋 — 캔버스가 그룹 멤버의 상대 변환을 처리한다. */
  onEditNodePosition: (nodeId: string, pos: { x: number; y: number }) => void
  /** 꺾임점 단일 축 편집 — 자동 경로면 이 커밋으로 수동 전환된다. */
  onEditEdgeWaypoint: (edgeId: string, vertexIndex: number, axis: 'x' | 'y', value: number) => void
  onResetEdgePath: (edgeId: string) => void
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
}
const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--erd-text-3)',
  width: 14,
  flexShrink: 0,
}
const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  fontSize: 12,
  fontFamily: 'var(--font-mono, ui-monospace)',
  background: 'var(--erd-surface-2)',
  border: '1px solid var(--erd-border)',
  borderRadius: 4,
  padding: '4px 8px',
  color: 'inherit',
  boxSizing: 'border-box',
}

/** 정수 좌표 입력 — Enter/blur 커밋, 비숫자는 원복. info 갱신 시 재동기화. */
function CoordInput({
  value,
  onCommit,
  testid,
}: {
  value: number
  onCommit: (v: number) => void
  testid: string
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => {
    setDraft(String(value))
  }, [value])
  function commit() {
    const n = Math.round(Number(draft))
    if (Number.isFinite(n) && n !== value) onCommit(n)
    else setDraft(String(value))
  }
  return (
    <input
      data-testid={testid}
      value={draft}
      inputMode="numeric"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
      }}
      onBlur={commit}
      style={inputStyle}
    />
  )
}

/**
 * Info 패널 최상단 "Selection" 섹션 (Q4 #3): 선택된 노드의 절대좌표 x/y,
 * 선택된 엣지의 꺾임점 목록을 표시·편집한다. 끝점은 컬럼 앵커라 표시하지
 * 않는다. widgets layer: entities 타입만 의존 (FSD).
 */
export function SelectionSection({
  info,
  onEditNodePosition,
  onEditEdgeWaypoint,
  onResetEdgePath,
}: SelectionSectionProps) {
  return (
    <div
      data-testid="selection-section"
      style={{ padding: '10px 14px', borderBottom: '1px solid var(--erd-border)', flexShrink: 0 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'var(--font-mono, ui-monospace)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {info.label}
        </span>
        <span
          style={{
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 9999,
            background: 'var(--erd-hover)',
            color: 'var(--erd-text-2)',
            flexShrink: 0,
          }}
        >
          {info.kind === 'node' ? info.nodeType : info.manual ? 'Manual' : 'Auto'}
        </span>
        {info.kind === 'edge' && info.manual && (
          <button
            data-testid="edge-reset-panel"
            title="Reset line"
            onClick={() => onResetEdgePath(info.edgeId)}
            style={{
              background: 'none',
              border: 'none',
              padding: 2,
              cursor: 'pointer',
              color: 'var(--erd-text-3)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RotateCw size={13} strokeWidth={2} />
          </button>
        )}
      </div>

      {info.kind === 'node' ? (
        <div style={rowStyle}>
          <span style={labelStyle}>X</span>
          <CoordInput
            value={info.x}
            testid="sel-x"
            onCommit={(v) => onEditNodePosition(info.nodeId, { x: v, y: info.y })}
          />
          <span style={labelStyle}>Y</span>
          <CoordInput
            value={info.y}
            testid="sel-y"
            onCommit={(v) => onEditNodePosition(info.nodeId, { x: info.x, y: v })}
          />
        </div>
      ) : info.waypoints.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--erd-text-3)' }}>No bends</div>
      ) : (
        info.waypoints.map((p, i) => (
          <div key={i} style={rowStyle}>
            <span style={{ ...labelStyle, width: 18 }}>#{i + 1}</span>
            <CoordInput
              value={p.x}
              testid={`wp-${i}-x`}
              onCommit={(v) => onEditEdgeWaypoint(info.edgeId, i, 'x', v)}
            />
            <CoordInput
              value={p.y}
              testid={`wp-${i}-y`}
              onCommit={(v) => onEditEdgeWaypoint(info.edgeId, i, 'y', v)}
            />
          </div>
        ))
      )}
    </div>
  )
}
```

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/widgets/erd-info-panel/ui/SelectionSection.test.tsx`
Expected: PASS

- [ ] **Step 3: ErdInfoPanel 합성**

`ErdInfoPanel.tsx` 수정:

import 추가:
```ts
import type { SelectionInfo } from '@/entities/erd'
import { SelectionSection } from './SelectionSection'
```

`ErdInfoPanelProps`에 추가:
```ts
  /** 캔버스가 보고한 현재 선택의 좌표 정보. 있으면 최상단에 Selection 섹션 표시. */
  selectionInfo?: SelectionInfo | null
  onEditNodePosition?: (nodeId: string, pos: { x: number; y: number }) => void
  onEditEdgeWaypoint?: (edgeId: string, vertexIndex: number, axis: 'x' | 'y', value: number) => void
  onResetEdgePath?: (edgeId: string) => void
```

컴포넌트 구조분해에 4개 prop 추가 후, return JSX 최상단(`<PanelHead label="Schema summary" />` 위)에 삽입:

```tsx
      {/* ── Selection (Q4 #3: 최상단, 선택 시에만) ─────────────── */}
      {selectionInfo && onEditNodePosition && onEditEdgeWaypoint && onResetEdgePath && (
        <>
          <PanelHead label="Selection" />
          <SelectionSection
            info={selectionInfo}
            onEditNodePosition={onEditNodePosition}
            onEditEdgeWaypoint={onEditEdgeWaypoint}
            onResetEdgePath={onResetEdgePath}
          />
        </>
      )}
```

- [ ] **Step 4: 페이지 최종 배선**

`frontend/src/pages/editor/index.tsx`의 `<ErdInfoPanel …>`에 추가:

```tsx
              selectionInfo={selectionInfo}
              onEditNodePosition={(nodeId, pos) =>
                captureHandleRef.current?.setNodePositionAbs(nodeId, pos)
              }
              onEditEdgeWaypoint={(edgeId, i, axis, v) =>
                captureHandleRef.current?.setEdgeWaypoint(edgeId, i, axis, v)
              }
              onResetEdgePath={(edgeId) =>
                captureHandleRef.current?.resetEdgePath(edgeId)
              }
```

- [ ] **Step 5: 전체 단위 + 타입 + 커밋**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run && docker compose -p codegram exec -T frontend npm run type-check`
Expected: PASS / 에러 없음

```bash
git add frontend/src
git commit -m "feat(info-panel): Selection section — node x/y + edge waypoint display & editing"
```

---

### Task 8: E2E — 드래그·persist·reset·좌표 편집

**Files:**
- Create: `frontend/e2e/edge-path.spec.ts`

사전 조건: 도커 스택이 현재 소스를 서빙 중 (`docker compose up -d`; 새 의존성 없음 — 재빌드 불요). autosave PATCH 대기는 **트리거 동작 전에** `waitForResponse`를 arm한다 (projects.spec.ts 패턴).

- [ ] **Step 1: 스펙 작성**

`frontend/e2e/edge-path.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test'

async function registerAndLogin(page: Page, email: string, password: string) {
  await page.goto('/register')
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill(password)
  await page.locator('#register-confirm-password').fill(password)
  const loginResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/jwt/login') && resp.status() === 204,
  )
  await page.getByRole('button', { name: 'Sign up' }).click()
  await loginResponse
  await page.waitForURL((url) => url.pathname === '/')
}

/**
 * 엣지의 '경로 위' 중점을 클릭한다. `.react-flow__edge` bbox 중심 클릭은 ㄱ자
 * 경로에서 빈 공간(→ onPaneClick → 선택 해제)일 수 있다 — getPointAtLength로
 * 경로 위의 점을 화면 좌표로 변환해 클릭하면 20px 인터랙션 스트로크에 항상
 * 명중한다.
 */
async function clickEdgeMidpoint(page: Page) {
  const pt = await page
    .locator('.react-flow__edge-path')
    .first()
    .evaluate((el) => {
      const p = el as SVGPathElement
      const m = p.getPointAtLength(p.getTotalLength() / 2)
      const c = p.getScreenCTM()!
      return { x: c.a * m.x + c.c * m.y + c.e, y: c.b * m.x + c.d * m.y + c.f }
    })
  await page.mouse.click(pt.x, pt.y)
}

async function createProjectWithRef(page: Page): Promise<string> {
  const createResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/projects') &&
      resp.request().method() === 'POST' &&
      resp.status() === 201,
  )
  await page.getByPlaceholder('Project name').fill('Edge Path Project')
  await page.getByRole('button', { name: 'Create' }).click()
  const created = await (await createResponse).json()
  const projectId = created.id as string
  await page.waitForURL((url) => url.pathname === `/editor/${projectId}`)

  // 초기 DBML 입력이 600ms 디바운스 PATCH를 하나 만든다. 여기서 arm해서
  // 소진해 두지 않으면 이후 테스트가 기다리는 PATCH가 이 저장에 먼저 낚여
  // 수동 경로가 저장되기 전에 reload하는 플레이크가 생긴다
  // (editor-layout.spec.ts의 initPatch 패턴과 동일).
  const initPatch = page.waitForResponse(
    (resp) =>
      resp.url().includes(`/api/projects/${projectId}`) &&
      resp.request().method() === 'PATCH' &&
      resp.ok(),
  )

  const dbml = [
    'Table users {',
    '  id integer [pk]',
    '}',
    'Table posts {',
    '  id integer [pk]',
    '  user_id integer [ref: > users.id]',
    '}',
  ].join('\n')
  const editor = page.getByTestId('dbml-editor')
  await editor.locator('.cm-content').click()
  await page.keyboard.type(dbml)

  await expect
    .poll(async () => page.locator('.react-flow__edge').count(), { timeout: 5000 })
    .toBeGreaterThanOrEqual(1)
  await initPatch // dbml autosave 소진 — 이후 PATCH 대기는 깨끗한 상태에서
  return projectId
}

test.describe('Manual edge paths', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('drag a segment, persist across reload, then reset', async ({ page }) => {
    const email = `edgepath-${Date.now()}@example.com`
    await registerAndLogin(page, email, 'password123')
    const projectId = await createProjectWithRef(page)

    // 1) 엣지 선택 → 세그먼트 핸들 표시
    await clickEdgeMidpoint(page)
    const handle = page.locator('[data-testid^="edge-seg-"]').first()
    await expect(handle).toBeVisible()

    // 2) 경로 d 캡처 후 핸들을 60px 끌기. PATCH 대기는 **payload 검사** —
    //    layout.edges가 실제로 실린 저장만 통과시켜 엉뚱한 PATCH에 낚이지 않는다.
    const dBefore = await page
      .locator('.react-flow__edge-path')
      .first()
      .getAttribute('d')
    const edgeSavePatch = page.waitForResponse((resp) => {
      if (!resp.url().includes(`/api/projects/${projectId}`)) return false
      if (resp.request().method() !== 'PATCH' || !resp.ok()) return false
      const body = resp.request().postDataJSON() as
        | { layout?: { edges?: Record<string, unknown> } }
        | null
      return Object.keys(body?.layout?.edges ?? {}).length > 0
    })
    const box = (await handle.boundingBox())!
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy + 60, { steps: 5 })
    await page.mouse.up()

    // 3) 수동 경로 전환: 경로가 바뀌고 Reset line 버튼이 나타난다
    await expect(page.getByTestId('edge-reset')).toBeVisible()
    const dAfter = await page
      .locator('.react-flow__edge-path')
      .first()
      .getAttribute('d')
    expect(dAfter).not.toBe(dBefore)
    await edgeSavePatch // 수동 경로가 실린 PATCH 완료 대기 (디바운스 600ms)

    // 4) 새로고침 후에도 수동 경로 유지 (다시 선택하면 Reset 버튼이 있다)
    await page.reload()
    await expect
      .poll(async () => page.locator('.react-flow__edge').count(), { timeout: 5000 })
      .toBeGreaterThanOrEqual(1)
    await clickEdgeMidpoint(page)
    await expect(page.getByTestId('edge-reset')).toBeVisible()

    // 5) Reset line → 자동 라우팅 복귀 (버튼이 사라짐) + 저장.
    //    payload 검사: layout이 실려 있고 edges가 비워진 PATCH만 통과.
    const resetPatch = page.waitForResponse((resp) => {
      if (!resp.url().includes(`/api/projects/${projectId}`)) return false
      if (resp.request().method() !== 'PATCH' || !resp.ok()) return false
      const body = resp.request().postDataJSON() as
        | { layout?: { edges?: Record<string, unknown> } }
        | null
      return body?.layout != null && Object.keys(body.layout.edges ?? {}).length === 0
    })
    await page.getByTestId('edge-reset').click()
    await expect(page.getByTestId('edge-reset')).toBeHidden()
    await resetPatch
  })

  test('Info panel shows and edits node coordinates', async ({ page }) => {
    const email = `selinfo-${Date.now()}@example.com`
    await registerAndLogin(page, email, 'password123')
    await createProjectWithRef(page)

    // 테이블 노드 클릭 → Selection 섹션에 x/y 표시
    await page
      .locator('.react-flow__node')
      .filter({ hasText: 'users' })
      .first()
      .click()
    await expect(page.getByTestId('selection-section')).toBeVisible()
    const xInput = page.getByTestId('sel-x')
    await expect(xInput).toBeVisible()

    // x를 600으로 수정 → 노드 transform이 600px로 이동
    await xInput.fill('600')
    await xInput.press('Enter')
    await expect
      .poll(async () =>
        page
          .locator('.react-flow__node')
          .filter({ hasText: 'users' })
          .first()
          .getAttribute('style'),
      )
      .toContain('600px')
  })

  test('Info panel shows edge waypoints when an edge is selected', async ({ page }) => {
    const email = `edgeinfo-${Date.now()}@example.com`
    await registerAndLogin(page, email, 'password123')
    await createProjectWithRef(page)

    await clickEdgeMidpoint(page)
    await expect(page.getByTestId('selection-section')).toBeVisible()
    // 'Auto'를 전역으로 찾으면 캔버스의 'Auto-arrange' 버튼과 substring 매칭되어
    // strict-mode 위반(2+ 요소)으로 죽는다 — 섹션으로 스코프 + exact 매칭.
    await expect(
      page.getByTestId('selection-section').getByText('Auto', { exact: true }),
    ).toBeVisible()
  })
})
```

- [ ] **Step 2: E2E 실행**

Run: `cd frontend && npx playwright test e2e/edge-path.spec.ts`
Expected: 3 passed

실패 시 흔한 원인:
- 핸들 클릭이 노드 드래그로 새는 경우 → `onHandlePointerDown`의 `stopPropagation` 확인
- 핸들 드래그가 no-op → 세그먼트 핸들 circle에 `pointerEvents: 'all'`이 있는지 확인 (React Flow의 `visibleStroke` 상속이면 채움 영역이 클릭 불가)
- PATCH 대기 타임아웃 → `createProjectWithRef`의 `initPatch` 소진과 payload 검사 waiter가 둘 다 들어갔는지 확인 (디바운스 600ms)

- [ ] **Step 3: 전체 회귀 (단위 + 기존 E2E 스모크) + 커밋**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run`
Expected: 전체 PASS

Run: `cd frontend && npx playwright test e2e/editor-erd.spec.ts e2e/editor-layout.spec.ts`
Expected: PASS (기존 캔버스/레이아웃 회귀 없음)

```bash
git add frontend/e2e
git commit -m "test(e2e): manual edge path drag/persist/reset + selection coordinate editing"
```

---

## Self-Review 체크리스트 (계획 작성 후 수행됨)

1. **요구 커버리지**: 선 수동 재배치(Task 1,3,5) / 좌표 표시·편집(Task 6,7) / dbdiagram 파악(ADR-0012·실측 근거) / 생존 규칙(Task 5 Auto-arrange, prune; rename·sync는 키 설계로 자동 충족) / E2E(Task 8) ✓
2. **타입 일관성**: `EdgePaths`/`StoredEdgePath`/`PathPoint`(entities/layout), `CanvasSelection`/`SelectionInfo`(entities/erd), `setEdgeWaypoint(edgeId, vertexIndex, axis, value)` 시그니처가 캔버스 핸들·패널·페이지에서 동일 ✓
3. **고지 사항**: `pages/editor/index.test.tsx`가 `selected`/`onSelectNode`를 모킹하면 Task 4 Step 6에서 함께 갱신. `useNodesState`의 노드 타입(`ErdFlowNode`)과 `setNodes(next)` 호환은 기존 helper-lines 코드와 동일 패턴.
## 구현 후 알려진 제한 (v1 기록 — 차단 아님)

- **HTML 노드 레이어가 SVG 엣지 장식을 가린다**: React Flow v12는 `EdgeRenderer → edgelabel-renderer → NodeRenderer` 순으로 그리므로, 세그먼트 핸들이나 플로팅 Reset 버튼의 위치가 테이블 카드와 겹치면 카드가 클릭을 가로챈다. 핸들은 경로 전체에 분포해 열린 구간에서 항상 잡을 수 있고, Reset은 패널의 `edge-reset-panel`이 완전한 대체 수단이라 v1 허용. 개선 옵션: Reset 버튼을 NodeRenderer 위 포털로 승격.
- **Playwright 설정 빚 (기존)**: `playwright.config.ts`의 baseURL이 `:5173`인데 도커 스택은 `:4001` — 12개 스펙 전체가 공유하는 리포 차원의 문제. 중앙에서 한 번에 고칠 것.

4. **적대적 검증 반영 (4-리뷰어 워크플로, 19건 → 고유 14건 수정 완료)**: 기하 엔진은 14/14 기대값 기계 검증 통과(수정 불요). 반영된 수정 — `edgePathCtx` 선언 위치(TDZ), `onSelectionInfo` 외부 래퍼 명시 전달, 세그먼트 핸들 `pointerEvents: 'all'`(React Flow `visibleStroke` 상속 대응), E2E `getByText('Auto')` 스코프+exact, dbml autosave PATCH 레이스(initPatch 소진 + payload 검사 waiter), `useLayoutPersistence.test.tsx` 기존 파일 충돌(생성→수정 + exact-shape 단언 5+1곳 갱신), `ErdCaptureHandle` 확장에 따른 editor 테스트 목 3곳 갱신, wiring 테스트 교체 블록에 active/highlight 회귀 케이스 보존, 엣지 클릭을 `getPointAtLength` 중점 클릭 헬퍼로 교체, 가로 세그먼트 드래그 테스트 픽스처 교정, index.ts 멀티라인 anchor 주의, CONTEXT.md 스테이징 포함.
