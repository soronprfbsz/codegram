# 2단계 코리도 엣지 라우팅 (공장라인) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관계선이 테이블을 절대 가로지르지 않고, 그룹 사이(1단계)·테이블 사이(2단계)의 넓은 코리도로만 다니며, 같은 PK는 버스로 묶이고 다른 PK는 평행선으로 흐르게 한다.

**Architecture:** 접근법 1(점진적 확장). (a) 레이아웃 간격 상수를 키워 코리도 폭 확보, (b) `RelationEdge`가 비-끝점 그룹 박스를 A* 장애물로 추가해 1단계 채널을 강제, (c) 후처리 순수함수(`mergeBundleRoutes`/`spreadEdgeRoutes`)가 장애물을 재검사해 카드 가로지름을 제거. 신규 파일 없음.

**Tech Stack:** TypeScript, React, `@xyflow/react`(React Flow v12), `@dagrejs/dagre`, Vitest(단위), Playwright(E2E). 테스트/타입체크는 docker 컨테이너에서 실행.

**참고 — 실행 환경/커밋 규칙:**
- 단위 테스트: `docker compose -p codegram exec -T frontend npm run test -- --run <파일경로>`
- 타입체크: `docker compose -p codegram exec -T frontend npx tsc --noEmit`
- 이 프로젝트는 임의 커밋을 하지 않는다. 현재 `main` 브랜치이므로, **커밋 단계 실행 전 사용자 동의를 받고 feature 브랜치를 먼저 생성**한다 (예: `git switch -c feat/corridor-edge-routing`). 동의 전까지 변경은 working tree에만 둔다.

설계 출처: `docs/superpowers/specs/2026-06-16-corridor-edge-routing-design.md`

---

## File Structure

- `frontend/src/entities/erd/lib/gridLayout.ts` — 수정: 테이블 사이 간격 `GAP_X`/`GAP_Y` 상향 (2단계 코리도 폭).
- `frontend/src/entities/erd/lib/groupedLayout.ts` — 수정: dagre `nodesep`/`ranksep` 상향 (1단계 채널).
- `frontend/src/features/erd-canvas/lib/routeOrthogonal.ts` — 수정: `crossesObstacle` export.
- `frontend/src/features/erd-canvas/lib/mergeBundleRoutes.ts` — 수정: `obstacles?` 파라미터 + 가로지르는 클러스터 폴백.
- `frontend/src/features/erd-canvas/lib/spreadEdgeRoutes.ts` — 수정: `obstacles?` 파라미터 + 가로지르는 이동 취소.
- `frontend/src/features/erd-canvas/ui/RelationEdge.tsx` — 수정: 순수 헬퍼 `buildObstacles` export + `orthoPoints`가 비-끝점 그룹 박스를 장애물로 포함; `EdgeRoutesProvider`에 obstacle 전달용으로 사용할 rect도 제공.
- `frontend/src/features/erd-canvas/lib/edgeRoutesContext.tsx` — 수정: `useStore`로 테이블 rect 파생 → `mergeBundleRoutes`/`spreadEdgeRoutes`에 전달.
- 테스트: `routeOrthogonal.test.ts`, `mergeBundleRoutes.test.ts`, `spreadEdgeRoutes.test.ts`, `RelationEdge.test.tsx`, `frontend/e2e/edge-path.spec.ts`.

---

## Task 1: 레이아웃 간격 확대 (고정 코리도 폭)

**Files:**
- Modify: `frontend/src/entities/erd/lib/gridLayout.ts:15-16`
- Modify: `frontend/src/entities/erd/lib/groupedLayout.ts:65`

기존 레이아웃 테스트는 상대/경계 단언(aspect 범위, 정렬, 무겹침)만 하므로 상수 변경으로 깨지지 않는다. 값은 reporter 스키마에서 눈으로 튜닝할 시작값이다.

- [ ] **Step 1: gridLayout 간격 상향**

`frontend/src/entities/erd/lib/gridLayout.ts`의 현재:
```ts
const GAP_X = 80
const GAP_Y = 80
```
을 다음으로 변경:
```ts
// 테이블 사이 코리도(공장라인 2단계) 폭. 평행선 여러 개가 카드를 스치지 않고
// 지나갈 만큼 넉넉하게(고정). 그룹 미사용 다이어그램의 전체 배치와
// packGroupedLayout의 그룹 내부 패킹 양쪽에 쓰인다.
const GAP_X = 120
const GAP_Y = 100
```

- [ ] **Step 2: groupedLayout dagre 간격 상향**

`frontend/src/entities/erd/lib/groupedLayout.ts`의 현재:
```ts
  g.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 140, marginx: 20, marginy: 20 })
```
을 다음으로 변경:
```ts
  // nodesep/ranksep = 그룹과 그룹 사이 1단계 채널 폭(고정 넉넉). 먼 그룹으로
  // 향하는 버스/평행선이 중간 그룹을 돌아갈 수 있는 통로를 보장한다.
  g.setGraph({ rankdir: 'LR', nodesep: 160, ranksep: 220, marginx: 20, marginy: 20 })
```

- [ ] **Step 3: 기존 레이아웃 테스트가 여전히 통과하는지 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/entities/erd/lib/gridLayout.test.ts src/entities/erd/lib/autoLayout.test.ts src/entities/erd/lib/groupedLayout.test.ts`
Expected: PASS (모든 테스트 통과 — 상대 단언만 하므로 영향 없음)

- [ ] **Step 4: Commit** (사용자 동의 + feature 브랜치 전제)

```bash
git add frontend/src/entities/erd/lib/gridLayout.ts frontend/src/entities/erd/lib/groupedLayout.ts
git commit -m "feat(erd-layout): widen table/group gaps for edge corridors"
```

---

## Task 2: `crossesObstacle`를 routeOrthogonal에서 export

**Files:**
- Modify: `frontend/src/features/erd-canvas/lib/routeOrthogonal.ts:47`
- Test: `frontend/src/features/erd-canvas/lib/routeOrthogonal.test.ts`

후처리 패스가 재사용할 수 있도록 내부 헬퍼를 공개한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/features/erd-canvas/lib/routeOrthogonal.test.ts` 맨 아래에 추가:
```ts
import { crossesObstacle } from './routeOrthogonal'

describe('crossesObstacle (exported helper)', () => {
  const box = { x: 100, y: 100, width: 100, height: 100 } // interior (100..200)

  it('returns true when a segment passes through an obstacle interior', () => {
    expect(crossesObstacle({ x: 50, y: 150 }, { x: 250, y: 150 }, [box])).toBe(true)
  })

  it('returns false when a segment merely grazes the obstacle border', () => {
    // y=100 is the top border — strict interior test allows grazing
    expect(crossesObstacle({ x: 50, y: 100 }, { x: 250, y: 100 }, [box])).toBe(false)
  })

  it('returns false when a segment is clear of all obstacles', () => {
    expect(crossesObstacle({ x: 50, y: 50 }, { x: 250, y: 50 }, [box])).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas/lib/routeOrthogonal.test.ts`
Expected: FAIL — `crossesObstacle` is not exported (import 에러 또는 undefined)

- [ ] **Step 3: export 추가**

`frontend/src/features/erd-canvas/lib/routeOrthogonal.ts`의 현재:
```ts
/** True if the axis-aligned segment a→b passes through any obstacle's interior. */
function crossesObstacle(a: Point, b: Point, obstacles: Rect[]): boolean {
```
을 다음으로 변경(앞에 `export`만 추가):
```ts
/** True if the axis-aligned segment a→b passes through any obstacle's interior. */
export function crossesObstacle(a: Point, b: Point, obstacles: Rect[]): boolean {
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas/lib/routeOrthogonal.test.ts`
Expected: PASS

- [ ] **Step 5: routeOrthogonal이 큰 장애물(그룹 박스 대용)을 우회하는지 가드 테스트 추가**

같은 파일에 추가(이미 통과할 것 — RelationEdge가 그룹 박스를 넘기면 우회한다는 계약을 문서화):
```ts
import { routeOrthogonal } from './routeOrthogonal'

describe('routeOrthogonal avoids a large (group-box) obstacle', () => {
  it('does not cross a big rectangle sitting between the endpoints', () => {
    const groupBox = { x: 200, y: 0, width: 200, height: 400 }
    const pts = routeOrthogonal(
      { x: 100, y: 200 }, // source (left of the box)
      { x: 500, y: 200 }, // target (right of the box)
      'right',
      'left',
      [groupBox],
    )
    // 인접 점들이 이루는 각 세그먼트가 박스 내부를 통과하지 않아야 한다.
    for (let i = 0; i < pts.length - 1; i++) {
      expect(crossesObstacle(pts[i], pts[i + 1], [groupBox])).toBe(false)
    }
  })
})
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas/lib/routeOrthogonal.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/erd-canvas/lib/routeOrthogonal.ts frontend/src/features/erd-canvas/lib/routeOrthogonal.test.ts
git commit -m "refactor(erd-canvas): export crossesObstacle; guard group-box avoidance"
```

---

## Task 3: `mergeBundleRoutes` 장애물 인식 (가로지르는 클러스터 폴백)

**Files:**
- Modify: `frontend/src/features/erd-canvas/lib/mergeBundleRoutes.ts`
- Test: `frontend/src/features/erd-canvas/lib/mergeBundleRoutes.test.ts`

trunk/fork 폴리라인이 카드를 가로지르면 그 클러스터를 원래 A* 경로로 둔다("never make worse" 확장).

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/features/erd-canvas/lib/mergeBundleRoutes.test.ts`에 추가:
```ts
describe('mergeBundleRoutes obstacle awareness', () => {
  // 같은 PK(=같은 bundle) 2개 멤버. trunk를 만들면 가운데 카드(blocker)를
  // 가로지르게 되는 배치 → 폴백되어 원래 경로가 유지되어야 한다.
  const keyOf = () => 'pk|R'
  const routes = [
    { id: 'a', points: [ { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 }, { x: 200, y: 10 } ] },
    { id: 'b', points: [ { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 300 }, { x: 200, y: 300 } ] },
  ]
  // side 추론: 마지막 stub가 우향(t.x>p.x) → 'left' 핸들 진입. trunkX = min(tx)+? 
  // 본 테스트는 trunk가 가로지를 카드를 trunk 경로 위에 놓는다.

  it('falls back to the raw routes when the trunk would cross a card', () => {
    // trunkX 부근(x≈170)과 두 멤버의 y범위(0..300)를 가로막는 카드.
    const blocker = { x: 150, y: 100, width: 60, height: 120 }
    const out = mergeBundleRoutes(routes, keyOf, [blocker])
    // 폴백 → 입력과 동일(병합 안 됨).
    expect(out.get('a')).toEqual(routes[0].points)
    expect(out.get('b')).toEqual(routes[1].points)
  })

  it('still merges when no obstacle blocks the trunk (obstacles=[])', () => {
    const out = mergeBundleRoutes(routes, keyOf, [])
    // 병합되면 'a'는 trunk 경유로 4점이 되며 입력과 달라진다.
    expect(out.get('a')).not.toEqual(routes[0].points)
  })

  it('is byte-identical to the no-arg call when obstacles is undefined', () => {
    const withUndef = mergeBundleRoutes(routes, keyOf)
    const out = mergeBundleRoutes(routes, keyOf, undefined)
    expect(out.get('a')).toEqual(withUndef.get('a'))
    expect(out.get('b')).toEqual(withUndef.get('b'))
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas/lib/mergeBundleRoutes.test.ts`
Expected: FAIL — `mergeBundleRoutes`는 3번째 인자를 받지 않아 blocker가 무시되고 병합되어 첫 테스트가 실패

- [ ] **Step 3: obstacles 파라미터 + 클러스터 폴백 구현**

`frontend/src/features/erd-canvas/lib/mergeBundleRoutes.ts` 상단 import에 추가:
```ts
import { crossesObstacle, type Rect } from './routeOrthogonal'
```
(기존 `import type { Point } from './routeOrthogonal'`는 유지하거나 위 import에 합쳐도 됨.)

함수 시그니처를 변경:
```ts
export function mergeBundleRoutes(
  routes: EdgeRoute[],
  bundleKeyOf: (id: string) => string | null,
  obstacles: Rect[] = [],
): Map<string, Point[]> {
```

클러스터 처리 루프(현재 `for (const cluster of clusters) { ... }` 내부)에서, 멤버별로 `copies.set` 하던 부분을 **후보를 먼저 만들고 전부 검증한 뒤 커밋**하도록 교체. 현재:
```ts
      for (const m of cluster) {
        const t = m.pts[m.pts.length - 1]
        copies.set(
          m.id,
          simplify([
            { x: src.x, y: src.y },
            { x: trunkX, y: src.y },
            { x: trunkX, y: t.y },
            { x: t.x, y: t.y },
          ]),
        )
      }
```
을 다음으로 변경:
```ts
      // 후보 폴리라인을 먼저 만들고, 하나라도 카드를 가로지르면 클러스터 전체를
      // 폴백(원래 A* 경로 유지). trunk/fork가 카드를 침범하지 않을 때만 커밋.
      const candidates = cluster.map((m) => {
        const t = m.pts[m.pts.length - 1]
        return {
          id: m.id,
          line: simplify([
            { x: src.x, y: src.y },
            { x: trunkX, y: src.y },
            { x: trunkX, y: t.y },
            { x: t.x, y: t.y },
          ]),
        }
      })
      const crosses = candidates.some((c) => {
        for (let i = 0; i < c.line.length - 1; i++) {
          if (crossesObstacle(c.line[i], c.line[i + 1], obstacles)) return true
        }
        return false
      })
      if (crosses) continue // 폴백: copies에는 이미 원래 경로의 deep-copy가 있다
      for (const c of candidates) copies.set(c.id, c.line)
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas/lib/mergeBundleRoutes.test.ts`
Expected: PASS (기존 테스트 포함 전부)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/erd-canvas/lib/mergeBundleRoutes.ts frontend/src/features/erd-canvas/lib/mergeBundleRoutes.test.ts
git commit -m "feat(erd-canvas): mergeBundleRoutes falls back when a trunk would cross a card"
```

---

## Task 4: `spreadEdgeRoutes` 장애물 인식 (가로지르는 이동 취소)

**Files:**
- Modify: `frontend/src/features/erd-canvas/lib/spreadEdgeRoutes.ts`
- Test: `frontend/src/features/erd-canvas/lib/spreadEdgeRoutes.test.ts`

세그먼트를 평행 트랙으로 옮길 때, 옮긴 위치가 카드를 가로지르면 그 멤버만 이동을 취소(원좌표 유지). 가로지름은 발생하지 않는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/features/erd-canvas/lib/spreadEdgeRoutes.test.ts`에 추가:
```ts
describe('spreadEdgeRoutes obstacle awareness', () => {
  // 두 독립 엣지의 수직 INTERIOR 세그먼트가 x=100에 겹침(near-overlap) →
  // 평소엔 평행 트랙으로 벌어진다. 한쪽을 벌리면 카드를 침범하는 배치를 만든다.
  const routes = [
    { id: 'a', points: [ { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 } ] },
    { id: 'b', points: [ { x: 0, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 210 }, { x: 300, y: 210 } ] },
  ]

  it('cancels a shift that would push a segment across a card', () => {
    // 벌어지는 방향(±gap/2 ≈ x≈100±) 양쪽을 카드로 막아 어느 트랙도 침범하게 만든다.
    const blockers = [
      { x: 60, y: 50, width: 30, height: 100 },   // 왼쪽 트랙을 막음
      { x: 110, y: 50, width: 30, height: 100 },  // 오른쪽 트랙을 막음
    ]
    const out = spreadEdgeRoutes(routes, 18, undefined, blockers)
    // 침범하는 이동은 취소 → 해당 수직 세그먼트의 x가 원래(100)에서 카드 안으로
    // 들어가지 않는다. 각 결과 세그먼트가 어떤 blocker도 가로지르지 않음을 단언.
    for (const id of ['a', 'b']) {
      const pts = out.get(id)!
      for (let i = 0; i < pts.length - 1; i++) {
        expect(crossesObstacle(pts[i], pts[i + 1], blockers)).toBe(false)
      }
    }
  })

  it('still spreads normally when obstacles is empty', () => {
    const out = spreadEdgeRoutes(routes, 18, undefined, [])
    // 벌어지면 두 수직 세그먼트의 x가 서로 달라진다.
    const ax = out.get('a')![1].x
    const bx = out.get('b')![1].x
    expect(ax).not.toEqual(bx)
  })

  it('is identical to the no-arg call when obstacles is undefined', () => {
    const a = spreadEdgeRoutes(routes, 18)
    const b = spreadEdgeRoutes(routes, 18, undefined, undefined)
    expect(b.get('a')).toEqual(a.get('a'))
    expect(b.get('b')).toEqual(a.get('b'))
  })
})
```
필요 시 파일 상단에 `import { crossesObstacle } from './routeOrthogonal'`가 테스트에 있는지 확인하고 없으면 추가.

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas/lib/spreadEdgeRoutes.test.ts`
Expected: FAIL — 4번째 인자 미지원, blocker 무시되어 카드를 침범하는 결과

- [ ] **Step 3: obstacles 파라미터 + 이동 취소 구현**

`frontend/src/features/erd-canvas/lib/spreadEdgeRoutes.ts` 상단 import 변경:
```ts
import { crossesObstacle, type Point, type Rect } from './routeOrthogonal'
```
(기존 `import type { Point } from './routeOrthogonal'`를 위로 교체.)

시그니처 변경:
```ts
export function spreadEdgeRoutes(
  routes: EdgeRoute[],
  gap = 12,
  bundleKeyOf?: (id: string) => string | null,
  obstacles: Rect[] = [],
): Map<string, Point[]> {
```

마지막 적용 루프(현재 `members.forEach((m, idx) => { ... pts[seg.i].x += delta ... })`)를 **이동 후 침범 검사 후 커밋**으로 교체. 현재:
```ts
    members.forEach((m, idx) => {
      const seg = segments[m]
      const delta = slotTrack[memberSlot[idx]] - seg.fixed
      if (delta === 0) return
      const pts = copies.get(seg.id)!
      if (seg.orient === 'v') {
        pts[seg.i].x += delta
        pts[seg.i + 1].x += delta
      } else {
        pts[seg.i].y += delta
        pts[seg.i + 1].y += delta
      }
    })
```
을 다음으로 변경:
```ts
    members.forEach((m, idx) => {
      const seg = segments[m]
      const delta = slotTrack[memberSlot[idx]] - seg.fixed
      if (delta === 0) return
      const pts = copies.get(seg.id)!
      // 이동 후보 좌표 계산.
      const a = { x: pts[seg.i].x, y: pts[seg.i].y }
      const b = { x: pts[seg.i + 1].x, y: pts[seg.i + 1].y }
      if (seg.orient === 'v') {
        a.x += delta
        b.x += delta
      } else {
        a.y += delta
        b.y += delta
      }
      // 이동한 세그먼트가 카드를 가로지르면 이동 취소(원좌표 유지).
      if (crossesObstacle(a, b, obstacles)) return
      pts[seg.i] = a
      pts[seg.i + 1] = b
    })
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas/lib/spreadEdgeRoutes.test.ts`
Expected: PASS (기존 테스트 포함 전부)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/erd-canvas/lib/spreadEdgeRoutes.ts frontend/src/features/erd-canvas/lib/spreadEdgeRoutes.test.ts
git commit -m "feat(erd-canvas): spreadEdgeRoutes cancels a shift that would cross a card"
```

---

## Task 5: `buildObstacles` 헬퍼 + RelationEdge 그룹 장애물 (1단계 채널)

**Files:**
- Modify: `frontend/src/features/erd-canvas/ui/RelationEdge.tsx`
- Test: `frontend/src/features/erd-canvas/ui/RelationEdge.test.tsx`

순수 헬퍼 `buildObstacles`를 RelationEdge 모듈에서 export하고 단위 테스트한다. 이 헬퍼가 "비-끝점 그룹만 장애물" 규칙을 담는다. `orthoPoints`는 이 헬퍼를 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/features/erd-canvas/ui/RelationEdge.test.tsx`에 추가(기존 import 블록에 `buildObstacles`, 필요한 타입을 추가):
```ts
import { buildObstacles, type ObstacleNode } from './RelationEdge'

describe('buildObstacles', () => {
  const rect = (x: number) => ({ x, y: 0, width: 100, height: 60 })
  const nodes: ObstacleNode[] = [
    { id: 't1', type: 'table', parentId: 'gA', rect: rect(0) },
    { id: 't2', type: 'table', parentId: 'gB', rect: rect(500) },
    { id: 't3', type: 'table', parentId: 'gC', rect: rect(1000) }, // 중간/무관 그룹 멤버
    { id: 'gA', type: 'group', rect: rect(-10) },
    { id: 'gB', type: 'group', rect: rect(490) },
    { id: 'gC', type: 'group', rect: rect(990) },
  ]

  it('always includes all table/enum/sticky cards', () => {
    const obs = buildObstacles(nodes, 't1', 't2')
    expect(obs).toContainEqual(rect(0))
    expect(obs).toContainEqual(rect(500))
    expect(obs).toContainEqual(rect(1000))
  })

  it('excludes the source and target groups, includes other groups', () => {
    const obs = buildObstacles(nodes, 't1', 't2') // src group gA, tgt group gB
    expect(obs).not.toContainEqual(rect(-10)) // gA excluded
    expect(obs).not.toContainEqual(rect(490)) // gB excluded
    expect(obs).toContainEqual(rect(990))     // gC included (1단계 우회 대상)
  })

  it('includes all groups when neither endpoint is grouped', () => {
    const ungrouped: ObstacleNode[] = [
      { id: 'u1', type: 'table', rect: rect(0) },
      { id: 'u2', type: 'table', rect: rect(500) },
      { id: 'gC', type: 'group', rect: rect(990) },
    ]
    const obs = buildObstacles(ungrouped, 'u1', 'u2')
    expect(obs).toContainEqual(rect(990))
  })

  it('treats an intra-group edge as having no group obstacle for its own group', () => {
    const obs = buildObstacles(nodes, 't1', 't1') // 같은 그룹 gA
    expect(obs).not.toContainEqual(rect(-10)) // gA 제외
    expect(obs).toContainEqual(rect(490))     // gB 포함
    expect(obs).toContainEqual(rect(990))     // gC 포함
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas/ui/RelationEdge.test.tsx`
Expected: FAIL — `buildObstacles`/`ObstacleNode`가 export되지 않음

- [ ] **Step 3: `buildObstacles` 헬퍼 구현 + import 정리**

`frontend/src/features/erd-canvas/ui/RelationEdge.tsx`의 import에 `Rect` 타입을 가져온다(이미 `type Rect`를 import 중이면 그대로). 파일 상단(컴포넌트 `RelationEdgeImpl` 정의 이전, `LANE_GAP` 상수 근처)에 추가:
```ts
/** 장애물 선택용 최소 노드 형태(테스트 가능하도록 InternalNode에서 분리). */
export interface ObstacleNode {
  id: string
  type?: string
  parentId?: string
  rect: Rect
}

/**
 * 이 엣지의 A* 장애물 집합을 만든다.
 * - 모든 table/enum/sticky 카드는 항상 장애물.
 * - group 박스는 "이 엣지의 source 그룹도 target 그룹도 아닌" 경우에만 장애물
 *   → 무관한 그룹을 통째로 우회(공장라인 1단계 채널). 끝점이 속한 그룹은 제외해
 *   진입을 허용하되, 그 내부 테이블은 위 규칙으로 여전히 장애물(2단계 위빙).
 */
export function buildObstacles(
  nodes: ObstacleNode[],
  sourceId: string,
  targetId: string,
): Rect[] {
  const groupOf = (id: string): string | undefined =>
    nodes.find((n) => n.id === id)?.parentId
  const srcGroup = groupOf(sourceId)
  const tgtGroup = groupOf(targetId)
  const out: Rect[] = []
  for (const n of nodes) {
    if (n.type === 'table' || n.type === 'enum' || n.type === 'sticky') {
      out.push(n.rect)
    } else if (n.type === 'group') {
      if (n.id !== srcGroup && n.id !== tgtGroup) out.push(n.rect)
    }
  }
  return out
}
```

이어서 `orthoPoints` `useMemo`의 장애물 수집부를 교체한다. 현재:
```ts
    const obstacles: Rect[] = []
    for (const n of nodeLookup.values()) {
      if (n.type !== 'table' && n.type !== 'enum' && n.type !== 'sticky') continue
      const pos = n.internals.positionAbsolute
      obstacles.push({
        x: pos.x,
        y: pos.y,
        width: n.measured?.width ?? 240,
        height: n.measured?.height ?? 80,
      })
    }
```
을 다음으로 변경(그룹 노드까지 ObstacleNode로 모은 뒤 buildObstacles 적용):
```ts
    const obsNodes: ObstacleNode[] = []
    for (const n of nodeLookup.values()) {
      if (
        n.type !== 'table' &&
        n.type !== 'enum' &&
        n.type !== 'sticky' &&
        n.type !== 'group'
      )
        continue
      const pos = n.internals.positionAbsolute
      obsNodes.push({
        id: n.id,
        type: n.type,
        parentId: n.parentId,
        rect: {
          x: pos.x,
          y: pos.y,
          // 그룹 박스는 style width/height(레이아웃이 설정), 카드는 measured.
          width: n.measured?.width ?? (n.width as number | undefined) ?? 240,
          height: n.measured?.height ?? (n.height as number | undefined) ?? 80,
        },
      })
    }
    const obstacles = buildObstacles(obsNodes, source, target)
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas/ui/RelationEdge.test.tsx`
Expected: PASS

- [ ] **Step 5: 타입체크**

Run: `docker compose -p codegram exec -T frontend npx tsc --noEmit`
Expected: 에러 없음. (`n.width`/`n.height`가 InternalNode에 없으면 `n.measured?.width ?? (n.style?.width as number | undefined) ?? 240`로 대체. tsc 에러 메시지에 맞춰 조정.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/erd-canvas/ui/RelationEdge.tsx frontend/src/features/erd-canvas/ui/RelationEdge.test.tsx
git commit -m "feat(erd-canvas): route around non-endpoint group boxes (corridor stage 1)"
```

---

## Task 6: `EdgeRoutesProvider`가 테이블 장애물을 후처리에 전달

**Files:**
- Modify: `frontend/src/features/erd-canvas/lib/edgeRoutesContext.tsx`

후처리(`mergeBundleRoutes`/`spreadEdgeRoutes`)가 카드 가로지름을 검사하도록 테이블 rect를 공급한다. 그룹 박스는 후처리 대상이 아니다(1단계 보장은 Task 5의 A*가 담당). 단위 테스트는 순수함수 Task 3/4에서 이미 커버되므로, 여기서는 배선 + 타입체크로 검증한다.

- [ ] **Step 1: useStore로 테이블 rect 파생 + ref 저장**

`frontend/src/features/erd-canvas/lib/edgeRoutesContext.tsx` 상단 import에 추가:
```ts
import { useStore } from '@xyflow/react'
import type { Rect } from './routeOrthogonal'
```

`EdgeRoutesProvider` 본문, `const [version, setVersion] = useState(0)` 아래에 추가:
```ts
  // 후처리 가로지름 검사용 카드 장애물(테이블/enum/sticky). ReactFlowProvider
  // 안이라 useStore로 노드 절대좌표를 읽을 수 있다. ref에 담아 기존 version
  // recompute 시점에 최신값을 사용한다(노드 이동 시 엣지 재등록 → bump 발생).
  const obstaclesRef = useRef<Rect[]>([])
  obstaclesRef.current = useStore((s) => {
    const rects: Rect[] = []
    for (const n of s.nodeLookup.values()) {
      if (n.type !== 'table' && n.type !== 'enum' && n.type !== 'sticky') continue
      const pos = n.internals.positionAbsolute
      rects.push({
        x: pos.x,
        y: pos.y,
        width: n.measured?.width ?? 240,
        height: n.measured?.height ?? 80,
      })
    }
    return rects
  })
```
(`useStore`의 셀렉터가 매 렌더 새 배열을 반환하면 불필요한 재구독이 생길 수 있으나, 여기서는 반환값을 곧장 ref에 대입만 하고 렌더 트리거로 쓰지 않으므로 무방하다. lint가 "셀렉터는 안정값을 반환해야 한다"고 경고하면 `useStore`를 `useStoreApi().getState()`로 대체해 recompute 메모 안에서 직접 읽어도 된다.)

- [ ] **Step 2: 후처리 호출에 obstacles 전달**

같은 파일의 `adjusted` `useMemo`(현재):
```ts
    const merged = mergeBundleRoutes(raw, keyOf)
    const mergedRoutes = raw.map(({ id }) => ({ id, points: merged.get(id)! }))
    return spreadEdgeRoutes(mergedRoutes, SPREAD_GAP, keyOf)
```
을 다음으로 변경:
```ts
    const obstacles = obstaclesRef.current
    const merged = mergeBundleRoutes(raw, keyOf, obstacles)
    const mergedRoutes = raw.map(({ id }) => ({ id, points: merged.get(id)! }))
    return spreadEdgeRoutes(mergedRoutes, SPREAD_GAP, keyOf, obstacles)
```

- [ ] **Step 3: 타입체크 + 기존 단위 테스트 회귀 확인**

Run: `docker compose -p codegram exec -T frontend npx tsc --noEmit`
Expected: 에러 없음

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas`
Expected: PASS (전체 erd-canvas 단위 테스트)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/erd-canvas/lib/edgeRoutesContext.tsx
git commit -m "feat(erd-canvas): feed table obstacles into route post-passes"
```

---

## Task 7: E2E — 그룹 스키마에서 가로지름 0 보장

**Files:**
- Modify: `frontend/e2e/edge-path.spec.ts`

reporter 스키마(그룹 포함)를 로드해 렌더된 모든 엣지 경로가 어떤 테이블 카드 내부도 통과하지 않음을 단언한다.

- [ ] **Step 1: 기존 spec의 헬퍼/패턴 확인**

`frontend/e2e/edge-path.spec.ts`를 읽어 (a) 프로젝트 생성 API 호출 방식, (b) `/editor/<id>` 로드 + 초기 PATCH 소비 패턴, (c) `.react-flow__edge-path`의 `d` 덤프 방식, (d) 그룹을 schema에 넣는 DBML `TableGroup` 문법을 파악한다. 새 테스트는 이 패턴을 그대로 따른다.

- [ ] **Step 2: 실패할 수 있는 E2E 테스트 작성**

`frontend/e2e/edge-path.spec.ts`에 추가(기존 헬퍼 재사용; 스키마는 2개 그룹에 걸친 FK가 중간 그룹을 지나도록 구성):
```ts
test('no edge path crosses any table card interior (corridor routing)', async ({ page }) => {
  // 그룹 2개 + 그룹 사이를 가로지르는 FK가 있는 DBML. (기존 spec의 프로젝트
  // 생성 헬퍼를 사용해 이 dbml로 프로젝트를 만들고 /editor 로 이동.)
  // TableGroup 문법으로 그룹을 정의하면 packGroupedLayout 경로를 탄다.
  // ... 기존 헬퍼로 프로젝트 생성 + 로드 + 초기 PATCH 소비 ...

  // 모든 카드 rect와 모든 엣지 경로를 수집.
  const cards = await page.$$eval('.react-flow__node-table', (els) =>
    els.map((el) => {
      const r = (el as HTMLElement).getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    }),
  )
  const crossings = await page.$$eval('.react-flow__edge-path', (paths) => {
    const out: number[] = []
    paths.forEach((p, idx) => {
      const path = p as SVGPathElement
      const len = path.getTotalLength()
      out.push(idx, len)
    })
    return out
  })
  // 경로를 촘촘히 샘플링해 카드 내부(strict interior, 2px 여유)를 통과하는 점이
  // 없는지 검사. getPointAtLength는 브라우저 컨텍스트에서 평가.
  const insideCount = await page.evaluate((cardsArg) => {
    const paths = Array.from(document.querySelectorAll('.react-flow__edge-path'))
    let inside = 0
    for (const p of paths) {
      const path = p as SVGPathElement
      const len = path.getTotalLength()
      for (let d = 0; d <= len; d += 4) {
        const pt = path.getPointAtLength(d)
        // 경로 좌표는 SVG 좌표 — 화면 좌표로 변환해 카드 rect와 비교.
        const screenCTM = path.getScreenCTM()
        if (!screenCTM) continue
        const sx = pt.x * screenCTM.a + pt.y * screenCTM.c + screenCTM.e
        const sy = pt.x * screenCTM.b + pt.y * screenCTM.d + screenCTM.f
        for (const c of cardsArg) {
          const m = 2 // strict interior 여유
          if (sx > c.x + m && sx < c.x + c.w - m && sy > c.y + m && sy < c.y + c.h - m) {
            inside++
            break
          }
        }
      }
    }
    return inside
  }, cards)
  void crossings
  expect(insideCount).toBe(0)
})
```
(주의: 경로 `d`는 flow 좌표, 카드 `getBoundingClientRect`는 화면 좌표다. 위처럼 `getScreenCTM`로 경로 점을 화면 좌표로 변환하면 둘을 같은 좌표계에서 비교할 수 있다. 기존 spec의 `getPointAtLength` + `elementFromPoint` 헬퍼가 있으면 그걸 재사용해 "엣지 위 점의 `elementFromPoint`가 table 카드가 아님"으로 단언하는 방식도 가능 — 더 단순하면 그쪽을 택한다.)

- [ ] **Step 3: docker 스택 기동 확인 + E2E 실행**

먼저 스택이 :4001에서 현재 소스를 서빙하는지 확인:
```bash
docker compose -p codegram up -d
curl -s localhost:4001 | grep -o '<title>[^<]*</title>'
```
Expected: `<title>Codegram</title>`

throwaway overlay config로 E2E 실행(메모리 레시피 — baseURL :4001, webServer undefined):
```bash
cd /home/soron/projects/codegram/frontend && npx playwright test --config playwright.bg-overlay.config.ts edge-path.spec.ts
```
Expected: 신규 테스트 PASS (가로지름 0). 기존 edge-path 테스트도 모두 PASS.

- [ ] **Step 4: 실패 시 디버깅(systematic-debugging)**

가로지름이 남으면, 메모리의 "live polyline 덤프 → vitest 재현" 기법으로 어떤 패스(merge/spread/A*)가 침범을 만드는지 격리한다. A* 자체가 침범하면 그룹 박스 측정값(`measured` 누락)이나 inflate margin을 점검; 후처리가 침범하면 obstacles 전달 누락을 점검.

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e/edge-path.spec.ts
git commit -m "test(e2e): assert no edge path crosses a table card (corridor routing)"
```

---

## Task 8: 전체 회귀 + 시각 확인

**Files:** 없음(검증만)

- [ ] **Step 1: 전체 프론트 단위 테스트**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run`
Expected: 전부 PASS

- [ ] **Step 2: 타입체크**

Run: `docker compose -p codegram exec -T frontend npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 전체 E2E**

Run: `cd /home/soron/projects/codegram/frontend && npx playwright test --config playwright.bg-overlay.config.ts`
Expected: 전부 PASS (사전 존재하던 `projects.spec.ts` rename 플레이크는 격리 재실행으로 구분 — 회귀 아님)

- [ ] **Step 4: before/after 시각 캡처**

reporter 스키마(account/customer/service/publishing/service_component 등 + 그룹)를 로드해 캡처. 확인 항목: (1) 선이 어떤 테이블도 가로지르지 않음, (2) 먼 그룹으로 가는 선이 중간 그룹을 돌아감(1단계 채널), (3) 같은 PK는 하나의 버스 trunk, 다른 PK는 평행선. 간격 상수(Task 1)가 부족/과하면 여기서 조정 후 단위 테스트 재확인.

- [ ] **Step 5: 메모리 갱신**

`same-pk-edge-bundling.md` 또는 신규 메모리에 이번 코리도 작업(2단계 채널 = 비-끝점 그룹 장애물, 후처리 장애물 인식, 간격 상수)을 기록.

---

## Self-Review 결과

- **Spec 커버리지**: §4.1→Task1, §4.2→Task5(+Task2 가드), §4.3→Task3/4/6, §6→Task2~8. 요구사항 5개 모두 태스크로 매핑됨.
- **Placeholder**: 없음(모든 코드 블록 실제 내용). E2E Task7 Step2는 기존 spec 헬퍼 재사용 부분만 "..."로 표기 — Step1에서 그 헬퍼를 먼저 읽도록 명시했고, 단언 로직 본체는 완전히 작성됨.
- **타입/시그니처 일관성**: `crossesObstacle(a,b,obstacles)`·`Rect`·`Point`·`mergeBundleRoutes(routes,keyOf,obstacles=[])`·`spreadEdgeRoutes(routes,gap,keyOf?,obstacles=[])`·`buildObstacles(nodes,sourceId,targetId)`·`ObstacleNode{id,type?,parentId?,rect}` — 태스크 간 명칭/시그니처 일치 확인됨.
