# 모델 1 — 목적지 그룹별 진입 trunk 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** account 같은 한 PK가 사방 그룹으로 가는 같은-PK 번들에서, 중간 그룹을 관통해 폴백되던 BOARD·operation 멤버를 목적지 그룹별 공유 진입 trunk(조건부 A*)로 합류시킨다.

**Architecture:** `mergeBundleRoutes.ts`의 grouped 멤버 처리 루프에서, 직선 하강 진입 구간이 카드/비-끝점 그룹을 가로지를 때만 `routeOrthogonal` A*로 클러스터당 1개 공유 진입 trunk(`src → (descentX, spineY)`)를 구해 우회한다. 진입 후엔 기존 spine 버스가 그룹 내부 포크를 그대로 이어받는다. 깨끗한 직선은 유지해 기존 동작·테스트를 보존.

**Tech Stack:** TypeScript, Vitest(단위), Playwright(E2E), React Flow(@xyflow/react), Vite. Docker compose project `codegram`(frontend :4001, backend :4000).

## Global Constraints

- 변경 파일: `frontend/src/features/erd-canvas/lib/mergeBundleRoutes.ts` + 그 단위 테스트만. RelationEdge / edgeRoutesContext / spreadEdgeRoutes / 레이아웃 상수는 **무변경**.
- `mergeBundleRoutes`는 **순수 함수**: 입력 deep-copy, 무변이, 새 Map 반환. React/외부 import 금지(`./routeOrthogonal`, `./spreadEdgeRoutes` 타입만).
- `groupBoxes` 미전달 시 기존 단위 테스트와 **byte-identical**. A* 코드는 grouped 클러스터 안에서만 실행.
- 직선 하강이 깨끗하면 직선 유지(기존 "intra-group spine bus" 정확점 테스트 byte-identical 통과).
- 폴백 현상 유지: 잔여 폴백 멤버는 raw A*(소스 fan) 그대로. 소스 fan 로직 무변경.
- 단위 테스트 실행: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas/lib/mergeBundleRoutes.test.ts`
- 타입체크: `docker compose -p codegram exec -T frontend npx tsc --noEmit`
- 전체 단위(회귀): `docker compose -p codegram exec -T frontend npm run test -- --run`
- 커밋은 사용자 동의 흐름(이 계획 실행 = 동의). main에서 작업.

---

## File Structure

- **Modify:** `frontend/src/features/erd-canvas/lib/mergeBundleRoutes.ts`
  - import에 `routeOrthogonal` 추가.
  - grouped 클러스터 루프(현재 209–245행) 내부에 조건부 A* 진입 trunk 로직 삽입. 헬퍼는 기존 클로저(`contains`, `lineCrosses`, `targetOf`) 재사용 + 작은 로컬 헬퍼(`crossesAnyGroup`, `samePoint`) 추가.
- **Modify (test):** `frontend/src/features/erd-canvas/lib/mergeBundleRoutes.test.ts`
  - 새 describe 블록 "intra-group spine bus: A* 진입 trunk로 중간 그룹 우회" 추가. 기존 테스트는 무변경.
- **Modify (E2E, 마지막 Task):** `frontend/e2e/edge-path.spec.ts`
  - 실제 스키마 축약본으로 account→BOARD/operation 합류 + 0 카드 관통 단언 추가.

---

## Task 1: 조건부 A* 진입 trunk — 단위 TDD

번들 grouped 경로에서, 직선 하강이 중간 그룹을 가로지를 때 A* 공유 진입 trunk로 우회하고, 깨끗하면 직선을 유지함을 단위 테스트로 고정한 뒤 구현한다.

**Files:**
- Modify: `frontend/src/features/erd-canvas/lib/mergeBundleRoutes.ts`
- Test: `frontend/src/features/erd-canvas/lib/mergeBundleRoutes.test.ts`

**Interfaces:**
- Consumes: `mergeBundleRoutes(routes, bundleKeyOf, obstacles=[], groupBoxes=[])`(시그니처 무변경), `routeOrthogonal(source, target, sourceSide, targetSide, obstacles, margin?, …): Point[]`, `crossesObstacle(a, b, obstacles): boolean`, `Rect`, `Point`.
- Produces: 외부 시그니처 변경 없음. grouped 멤버의 진입 구간이 조건부로 A* 경로를 갖는 새 동작.

- [ ] **Step 1: 실패하는 테스트 추가**

`mergeBundleRoutes.test.ts` 파일 끝(마지막 `})` 바로 위, 즉 `describe('mergeBundleRoutes obstacle awareness', () => {` 블록 내부 끝)에 새 describe 블록을 추가한다. fixture: src는 위(y=0), 목적지 그룹은 아래(y=1000+), 그 사이 비-끝점 그룹이 직선 하강 x=983을 가로막는다.

```ts
  // 모델 1: 직선 하강(descentX 수직)이 중간(비-끝점) 그룹을 관통하는 경우, A*로
  // 클러스터당 1개 공유 진입 trunk를 만들어 우회한다. 깨끗하면 직선 유지(기존 동작).
  describe('intra-group spine bus: A* 진입 trunk로 중간 그룹 우회', () => {
    const keyL = () => 'pk|L'
    const src = { x: 0, y: 0 } // 위쪽 소스, 오른쪽으로 leave
    // 목적지 그룹(아래): 안에 2개 타깃(col0, 내부 col1).
    const destGroup = { x: 1000, y: 1000, width: 600, height: 400 }
    const colA = { x: 1012, y: 1040, width: 240, height: 120 } // 타깃 카드 a
    const colB = { x: 1372, y: 1040, width: 240, height: 100 } // 타깃 카드 b(내부 컬럼)
    // 중간(비-끝점) 그룹: 직선 하강 x=983(=1013-30), y 0..1000 을 가로막는다.
    const midGroup = { x: 900, y: 400, width: 400, height: 300 } // x900..1300, y400..700
    const routes = [
      { id: 'a', points: [src, { x: 30, y: 0 }, { x: 30, y: 1100 }, { x: 1013, y: 1100 }] },
      { id: 'b', points: [src, { x: 30, y: 0 }, { x: 30, y: 1100 }, { x: 1373, y: 1100 }] },
    ]
    const obstacles = [colA, colB]
    const groupBoxes = [destGroup, midGroup]

    const isOrtho2 = (pts: Point[]) =>
      pts.every((p, i) => i === 0 || p.x === pts[i - 1].x || p.y === pts[i - 1].y)
    // line의 어떤 세그먼트도 box 내부(strict)를 가로지르지 않는가.
    const crossesBox = (line: Point[], box: { x: number; y: number; width: number; height: number }) => {
      for (let i = 0; i + 1 < line.length; i++) {
        const minX = Math.min(line[i].x, line[i + 1].x), maxX = Math.max(line[i].x, line[i + 1].x)
        const minY = Math.min(line[i].y, line[i + 1].y), maxY = Math.max(line[i].y, line[i + 1].y)
        if (maxX > box.x && minX < box.x + box.width && maxY > box.y && minY < box.y + box.height) return true
      }
      return false
    }

    it('중간 그룹을 가로지르는 직선 하강을 A* 진입 trunk로 우회시키고, 공유 prefix로 합류', () => {
      const out = mergeBundleRoutes(routes, keyL, obstacles, groupBoxes)
      const a = out.get('a')!
      const b = out.get('b')!
      // 1) 두 멤버 모두 raw 경로가 아니라 재작성됨(번들 형성).
      expect(a).not.toEqual(routes[0].points)
      expect(b).not.toEqual(routes[1].points)
      // 2) 각자 자기 타깃에 도달.
      expect(a[a.length - 1]).toEqual({ x: 1013, y: 1100 })
      expect(b[b.length - 1]).toEqual({ x: 1373, y: 1100 })
      // 3) 직교 유지.
      expect(isOrtho2(a)).toBe(true)
      expect(isOrtho2(b)).toBe(true)
      // 4) 어떤 멤버도 중간 그룹·타깃 카드 내부를 가로지르지 않음(핵심).
      expect(crossesBox(a, midGroup)).toBe(false)
      expect(crossesBox(b, midGroup)).toBe(false)
      expect(crossesBox(a, colB)).toBe(false) // a는 colB를 안 건드림
      expect(crossesBox(b, colA)).toBe(false) // b는 colA를 안 건드림
      // 5) 진입 trunk 공유(소스 부채꼴 아님): 두 멤버가 소스에서 같은 첫 세그먼트로
      //    떠나 우회 trunk를 공유한다. outermost 컬럼(gx=descentX)은 entry 정점이
      //    spine로 collapse되고 A*가 entry에 수평 도달하면 그 정점이 simplify로
      //    병합될 수 있어, 정확 정점 비교 대신 공통 prefix 길이로 검증한다.
      let lcp = 0
      while (lcp < a.length && lcp < b.length && a[lcp].x === b[lcp].x && a[lcp].y === b[lcp].y) lcp++
      expect(a[0]).toEqual(src)
      expect(lcp).toBeGreaterThanOrEqual(2) // src + 공유 leave 정점 → 부채꼴이 아님
    })

    it('직선 하강이 깨끗하면(중간 그룹 없음) A* 없이 기존 spine 직선 진입 유지', () => {
      // midGroup 제거 → 직선 하강 x=983, y0..1000 이 막히지 않음.
      const out = mergeBundleRoutes(routes, keyL, obstacles, [destGroup])
      const a = out.get('a')!
      // 기존 직선 진입: src → (983,0) → (983,1000) → … 의 첫 꺾임이 (983,0).
      expect(a[1]).toEqual({ x: 983, y: 0 })
    })
  })
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas/lib/mergeBundleRoutes.test.ts`
Expected: 첫 it(`A* 진입 trunk로 우회`)가 FAIL — 현재는 직선 하강이 midGroup을 가로질러 `crossesBox(a, midGroup)`가 true이거나, per-member `lineCrosses`(테이블 카드만 검사 → midGroup은 그룹 박스라 미검출)로 직선이 그대로 커밋돼 `crossesBox(... midGroup)` true. 두 번째 it는 PASS일 수 있음(현 동작).

- [ ] **Step 3: 최소 구현 — 조건부 A* 진입 trunk**

`mergeBundleRoutes.ts` 상단 import를 수정한다.

```ts
import { crossesObstacle, routeOrthogonal, type Rect, type Point } from './routeOrthogonal'
```

grouped 클러스터 루프(`for (const cluster of groupedMembers.values()) {` … 현재 `geomOk` 가드 직후, `spineY` 계산 이후, 멤버 `for` 루프 직전)에서 진입 구간을 조건부 A*로 만든다. 기존 멤버 루프의 `simplify([...])`를 `[...approachPath, …]`로 바꾼다. 전체 grouped 블록을 아래로 교체한다(현재 209–245행 블록):

```ts
    // --- Grouped targets: 2-level spine bus, per group ---
    // src가 속한 그룹 인덱스(없으면 -1). 진입 A*에서 src 그룹/목적지 그룹 박스는 제외.
    const srcGroupIdx = groupBoxes.findIndex((g) => contains(g, src))
    // 한 박스 line이 그 박스 내부를 가로지르는지(자기 끝점 든 박스는 제외 — 기존 규칙).
    const crossesAnyGroup = (line: Point[], boxes: Rect[]): boolean => {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i]
        const b = line[i + 1]
        const others = boxes.filter((o) => !contains(o, a) && !contains(o, b))
        if (crossesObstacle(a, b, others)) return true
      }
      return false
    }
    const samePoint = (p: Point, q: Point): boolean => p.x === q.x && p.y === q.y

    for (const [gi, cluster] of groupedMembers.entries()) {
      if (cluster.length < 2) continue
      const txs = cluster.map((m) => targetOf(m).x)
      const descentX =
        side === 'left' ? Math.min(...txs) - APPROACH_STUB : Math.max(...txs) + APPROACH_STUB
      const geomOk =
        side === 'left'
          ? descentX > src.x && txs.every((t) => t >= descentX) && leaveSign > 0
          : descentX < src.x && txs.every((t) => t <= descentX) && leaveSign < 0
      if (!geomOk) continue
      const topOf = (t: Point): number => {
        const card = obstacles.find((o) => contains(o, t))
        return card ? card.y : t.y
      }
      const spineY = Math.min(...cluster.map((m) => topOf(targetOf(m)))) - SPINE_RISE

      // 진입 구간: 기본은 직선 하강. 직선이 카드(테이블) 또는 비-끝점 그룹 박스를
      // 가로지르면 A*로 클러스터당 1개 공유 진입 trunk를 구해 우회한다. A*가 못 찾으면
      // 직선으로 안전 폴백(현행 동작). 깨끗하면 직선 유지 → 기존 정확점 테스트 보존.
      const straightApproach: Point[] = [
        { x: src.x, y: src.y },
        { x: descentX, y: src.y },
        { x: descentX, y: spineY },
      ]
      const nonEndpointGroups = groupBoxes.filter((_, i) => i !== gi && i !== srcGroupIdx)
      let approachPath = straightApproach
      if (lineCrosses(straightApproach) || crossesAnyGroup(straightApproach, nonEndpointGroups)) {
        const entry = { x: descentX, y: spineY }
        const approachObstacles = [...obstacles, ...nonEndpointGroups]
        // sourceSide는 src의 leave 방향(leaveSign), targetSide는 번들의 side.
        // (side는 target 스텁 기준이라 src leave 방향과 반대일 수 있음 — 둘을 구분.)
        const srcSide = leaveSign > 0 ? 'right' : 'left'
        // A* target을 spineY-1로 두어 entry 직전에 수직 세그먼트를 강제한다:
        // routeOrthogonal은 target에 수평 도달하므로, target=entry로 두면 member
        // loop의 simplify가 entry 정점을 collinear로 삭제해 trunk가 gutter에
        // 수렴하지 못한다. spineY-1로 도달 후 entry를 덧붙이면 수직 진입이 보존됨.
        const aTarget = { x: descentX, y: spineY - 1 }
        const a = routeOrthogonal(
          { x: src.x, y: src.y },
          aTarget,
          srcSide,
          side,
          approachObstacles,
        )
        if (a.length >= 2 && samePoint(a[0], src) && samePoint(a[a.length - 1], aTarget)) {
          approachPath = [...a, entry]
        }
      }

      for (const m of cluster) {
        const t = targetOf(m)
        const gx = side === 'left' ? t.x - APPROACH_STUB : t.x + APPROACH_STUB
        const line = simplify([
          ...approachPath,
          { x: gx, y: spineY },
          { x: gx, y: t.y },
          { x: t.x, y: t.y },
        ])
        if (!lineCrosses(line)) copies.set(m.id, line)
      }
    }
```

주의:
- 루프 헤더가 `for (const cluster of groupedMembers.values())` → `for (const [gi, cluster] of groupedMembers.entries())`로 바뀐다(그룹 인덱스 `gi` 필요).
- `descentX`/`geomOk`/`topOf`/`spineY` 계산은 기존과 동일(이동만). 멤버 루프의 `simplify(...)` 인자가 직선 6점에서 `[...approachPath, …]`로 바뀐 것이 유일한 동작 변화.
- `contains`/`lineCrosses`/`targetOf`/`simplify`/`APPROACH_STUB`/`SPINE_RISE`/`side`/`leaveSign`/`src`는 기존 클로저/상수 그대로.

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/features/erd-canvas/lib/mergeBundleRoutes.test.ts`
Expected: 새 describe 2개 it 모두 PASS. 기존 mergeBundleRoutes 테스트 전부 PASS(특히 "intra-group spine bus"가 직선 유지로 byte-identical).

- [ ] **Step 5: 전체 단위 + 타입체크(회귀)**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run`
Expected: 기존 503 + 신규 2 모두 PASS(회귀 0).
Run: `docker compose -p codegram exec -T frontend npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/erd-canvas/lib/mergeBundleRoutes.ts frontend/src/features/erd-canvas/lib/mergeBundleRoutes.test.ts
git commit -m "$(cat <<'EOF'
feat(erd-canvas): conditional A* approach trunk for cross-group same-PK bus

When a grouped same-PK bundle's straight descent crosses a card or a
non-endpoint group box, route one shared source->group-entry trunk via
routeOrthogonal A* (non-endpoint groups as obstacles), then hand off to
the existing spine bus. Clear descents stay straight (existing exact-point
tests byte-identical). Fixes the account fan where BOARD/operation members
tunnelled the intervening version group and fell back to the raw A* fan.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 라이브 재현 + E2E — 실제 스키마 account fan 합류 검증

실제 스키마(축약본)에서 account→BOARD/operation 멤버가 부채꼴이 아니라 그룹당 1개 trunk로 합류하고 어떤 경로도 카드를 안 가로지름을 E2E로 고정한다. (단위 통과 후 실제 React Flow 좌표에서 회귀를 막는 가드.)

**Files:**
- Modify: `frontend/e2e/edge-path.spec.ts`
- (재현용 임시 검증은 `frontend/e2e/__model1.spec.ts`로 만들고 확인 후 삭제)

**Interfaces:**
- Consumes: 기존 E2E 헬퍼 패턴(프로젝트 API 생성 → `/editor/<id>` 로드 → `.react-flow__edge-path` `d` 덤프, getScreenCTM + getPointAtLength 2px inset 카드 관통 검사). 실제 스키마 파일 `/tmp/codegram-real-schema.dbml`.
- Produces: 회귀 가드 E2E 1개.

- [ ] **Step 1: 도커 스택·HMR 확인**

Run: `docker compose -p codegram up -d && curl -s localhost:4001 | grep -o '<title>[^<]*</title>'`
Expected: 컨테이너 up, title 출력(프론트 정상). 코드는 bind-mount HMR로 이미 반영됨.

- [ ] **Step 2: 임시 재현 스펙으로 라이브 좌표 덤프**

`frontend/e2e/__model1.spec.ts`(throwaway, `__` 접두사 — 모듈 해석 위해 `e2e/` 안에 둠)를 만든다. `/tmp/codegram-real-schema.dbml`로 프로젝트를 생성하고 에디터를 연 뒤, `e.target`이 account 그룹 밖(BOARD/operation)인 `account_id` 엣지들의 `d`를 `page.evaluate`로 덤프해, 각 엣지의 첫 꺾임 x(소스 fan 여부)와 목적지 그룹별 trunk 수렴을 콘솔에 찍는다.

Run: `cd /home/soron/projects/codegram/frontend && npx playwright test --config playwright.bg-overlay.config.ts __model1.spec.ts`
Expected: BOARD·operation account_id 엣지의 첫 꺾임 x가 목적지 그룹별로 **1개 값(또는 ±소수)으로 수렴**(이전 1081/1109/…/1193 14px 부채꼴이 사라짐). 수렴 안 하면 Task 1로 돌아가 systematic-debugging(flow 좌표로 멤버별 경로·중간 그룹 박스 덤프해 A* 우회/폴백 분기 확인).

- [ ] **Step 3: 정식 E2E 케이스 추가**

`edge-path.spec.ts`에, 기존 "corridor routing"/"bus" 테스트의 헬퍼 패턴을 그대로 따라 케이스를 추가한다. 픽스처는 account가 한 그룹에 있고 그 PK FK가 (a) 같은-y 옆 그룹과 (b) **아래/위로 중간 그룹을 낀** 그룹에 걸치는 최소 3-그룹 스키마(실제 스키마 축약 또는 인라인 DBML). 단언:
1. 아래/위 그룹으로 가는 같은-PK 엣지들의 첫 꺾임 x(또는 진입 trunk x)가 그룹당 **1개로 수렴**(부채꼴 폭 > LANE_GAP*2 가 아님).
2. 모든 `.react-flow__edge-path` 샘플점이 어떤 `.react-flow__node-table` 내부(2px inset)에도 없음.

(정확한 단언 코드는 기존 "no edge path crosses any table card interior (corridor routing)" 테스트의 getScreenCTM + getPointAtLength 루프를 복사해 사용 — 그 테스트가 카드 관통 0 검사의 레퍼런스.)

- [ ] **Step 4: E2E 실행 → 통과 확인**

Run: `cd /home/soron/projects/codegram/frontend && npx playwright test --config playwright.bg-overlay.config.ts edge-path.spec.ts`
Expected: 신규 케이스 PASS + 기존 edge-path 10개 PASS(특히 :372 fan 케이스 — 소스 fan 무변경). `projects.spec.ts:70` rename flake는 격리 시 통과(회귀 아님, full-parallel에서만 간헐).

- [ ] **Step 5: 임시 스펙 삭제**

```bash
rm /home/soron/projects/codegram/frontend/e2e/__model1.spec.ts
```

- [ ] **Step 6: 커밋**

```bash
git add frontend/e2e/edge-path.spec.ts
git commit -m "$(cat <<'EOF'
test(erd-canvas): e2e — cross-group same-PK members converge on a group trunk

Asserts that same-PK FK edges crossing into a group below/above (with an
intervening group) converge onto one approach trunk per destination group
instead of a source fan, and that no edge path crosses a table card.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review (작성자 체크)

**1. Spec coverage:**
- spec §5.1 진입 장애물 집합(srcGroupIdx, nonEndpointGroups, approachObstacles) → Task 1 Step 3 ✓
- spec §5.2 조건부 A*(straightApproach 검사 → A* → degenerate 폴백) → Task 1 Step 3 ✓
- spec §5.3 멤버별 `[...approachPath, (gx,spineY), (gx,t.y), (t.x,t.y)]` + lineCrosses 폴백 → Task 1 Step 3 ✓
- spec §5.4 안전 폴백(geomOk 유지, A* degenerate → 직선) → Task 1 Step 3 ✓
- spec §6 byte-identical(groupBoxes 미전달/깨끗 직선) → Task 1 Step 1 두 번째 it + Step 5 ✓
- spec §6 entry free-waypoint 스텁 검증 → Task 2 Step 2(라이브 덤프) ✓
- spec §7.1 단위 → Task 1 ✓ / §7.2 E2E → Task 2 ✓ / §7.3 회귀 → Task 1 Step 5, Task 2 Step 4 ✓
- spec §3 Q3 소스 fan 현상 유지 → 코드에서 소스 fan 미변경(RelationEdge 무변경) ✓

**2. Placeholder scan:** Task 2 Step 3의 정식 E2E 단언 코드는 "기존 corridor 테스트 복사"로 위임 — 라이브 좌표(Step 2)가 픽스처별로 달라 정확 수치를 사전 박제할 수 없어, 레퍼런스 테스트를 명시하고 복사 지시. 그 외 코드 스텝은 전체 코드 포함.

**3. Type consistency:** `routeOrthogonal(source, target, sourceSide, targetSide, obstacles, …): Point[]` — Task 1에서 5인자 호출, side는 `'left'|'right'`(기존 `side` 변수 타입) ✓. `crossesObstacle(a,b,obstacles)`, `contains(o,p)`, `lineCrosses(line)`, `targetOf(m)`, `simplify(pts)` 모두 기존 시그니처와 일치 ✓. 새 헬퍼 `crossesAnyGroup(line, boxes)`, `samePoint(p,q)` — Task 1 내부 정의·사용 일치 ✓.
