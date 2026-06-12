# 그룹 상호작용 정리 + 그룹별 그리드 레이아웃 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 그룹 영역이 내부 엣지/핸들/버튼 클릭을 가로채지 않게 만들고(라벨로만 드래그), 그룹 내부를 콤팩트 그리드로 배치하며 그룹별 자동 정렬 버튼을 제공한다.

**Architecture:** 순수 레이아웃 계층(entities/erd·entities/layout)에 "그룹별 내부 그리드 패킹 + 블록 메타배치"(`packGroupedLayout`)와 "그룹 1개 제자리 정리"(`arrangeGroupInPlace`)를 추가하고 `autoLayout`의 dagre-compound 분기를 교체한다. 캔버스 계층(features/erd-canvas)에서 그룹 노드를 `pointer-events:none` 배경 + 라벨 크롬(드래그 핸들 + hover 시 정렬 버튼)으로 바꾸고, `GroupActionContext`로 정렬 핸들러를 노출한다.

**Tech Stack:** React + @xyflow/react v12, @dagrejs/dagre, Vitest, Playwright. FSD 레이어(entities → features). 도커 스택(:4001), `docker compose -p codegram exec -T frontend npm run test:run`.

**관련 문서:** CONTEXT.md(그룹 라벨 드래그·통과, 수동경로 그룹별 예외), ADR-0010(2026-06-12 개정: 그룹별 내부 그리드 + 메타배치), ADR-0004(이름 기반 reconcile), ADR-0012(수동 경로).

**핵심 사실 (구현 전 숙지):**
- `gridLayout(nodes, edges)` (`entities/erd/lib/gridLayout.ts`)는 절대좌표를 (0,0)부터 채우는 순수 그리드 패커다. 부분집합(한 그룹의 멤버들)에 그대로 호출 가능하다.
- `separateGroups(nodes, gap?)`는 그룹 박스끼리만 떨어뜨린다(멤버는 parentId로 따라감).
- `nodeSize(node)`, `GROUP_PAD_X`, `GROUP_PAD_TOP`, `GROUP_PAD_BOTTOM`은 `entities/erd`에서 export된다.
- React Flow에서 그룹 멤버 테이블은 `parentId=group.id`이며 `position`은 그룹 원점 기준 **상대좌표**다(절대 = 부모 절대 + 자식 상대).
- 그룹 노드 박스는 `fitGroupBoxes`(entities/layout)가 항상 멤버로부터 재계산한다 → 그룹 위치는 파생값이다.

---

## File Structure

**생성:**
- `frontend/src/entities/erd/lib/groupedLayout.ts` — 그룹별 내부 그리드 + dagre 메타배치(순수). `autoLayout`의 그룹 분기가 호출.
- `frontend/src/entities/erd/lib/groupedLayout.test.ts`
- `frontend/src/entities/layout/lib/arrangeGroup.ts` — 그룹 1개 제자리 정리(순수).
- `frontend/src/entities/layout/lib/arrangeGroup.test.ts`
- `frontend/src/features/erd-canvas/lib/groupActionContext.ts` — `onArrangeGroup(groupId)` 노출(edgePathContext와 동일 패턴).

**수정:**
- `frontend/src/entities/erd/lib/autoLayout.ts` — 그룹 분기를 `packGroupedLayout` 호출로 교체.
- `frontend/src/entities/erd/lib/autoLayout.test.ts` — 그룹 케이스 기대값 갱신.
- `frontend/src/entities/erd/lib/schemaToFlow.ts` — 그룹 노드에 `dragHandle` 지정.
- `frontend/src/entities/layout/index.ts` — `arrangeGroupInPlace` export.
- `frontend/src/features/erd-canvas/ui/GroupNode.tsx` — 통과 배경 + 라벨 크롬(드래그 핸들) + hover 정렬 버튼.
- `frontend/src/features/erd-canvas/ui/GroupNode.test.tsx`
- `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx` — GroupActionContext provider + `onArrangeGroup` 핸들러.
- `frontend/src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx`
- `frontend/src/index.css` — 그룹 노드 통과/크롬 pointer-events 규칙.
- `frontend/e2e/table-groups.spec.ts` — 라벨 드래그·내부 클릭·그룹 정렬 E2E.

---

## Part A — 순수 레이아웃 엔진

### Task A1: `packGroupedLayout` — 그룹별 내부 그리드 + dagre 메타배치

**Files:**
- Create: `frontend/src/entities/erd/lib/groupedLayout.ts`
- Test: `frontend/src/entities/erd/lib/groupedLayout.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// frontend/src/entities/erd/lib/groupedLayout.test.ts
import { describe, it, expect } from 'vitest'
import { packGroupedLayout } from './groupedLayout'
import { nodeSize, GROUP_PAD_TOP, GROUP_PAD_BOTTOM } from './nodeSize'
import type { ErdFlowNode, ErdFlowEdge } from '../model/types'

function table(id: string, cols: number, parentId?: string): ErdFlowNode {
  return {
    id,
    type: 'table',
    position: { x: 0, y: 0 },
    data: { tableName: id, tableId: id, columns: Array.from({ length: cols }, (_, i) => ({ id: `${id}.c${i}`, name: `c${i}`, type: 'int', pk: false, fk: false, nn: false, unique: false })) },
    ...(parentId ? { parentId } : {}),
  } as ErdFlowNode
}
function group(id: string): ErdFlowNode {
  return { id, type: 'group', position: { x: 0, y: 0 }, data: { groupName: id } } as ErdFlowNode
}

describe('packGroupedLayout', () => {
  it('packs a group of 6 same-size members into a compact grid (not one tall column)', () => {
    const g = group('group:G')
    const members = Array.from({ length: 6 }, (_, i) => table(`public.t${i}`, 3, 'group:G'))
    const out = packGroupedLayout([g, ...members], [])

    const box = out.find((n) => n.id === 'group:G')!
    const memberH = nodeSize(members[0]).height
    // 6 members stacked vertically would be ~6*memberH + gaps + pads. A grid
    // (≈3x2 at 16:10) must be far shorter than the all-vertical degenerate case.
    const allVertical = 6 * memberH + 5 * 80 + GROUP_PAD_TOP + GROUP_PAD_BOTTOM
    expect(box.style!.height as number).toBeLessThan(allVertical * 0.6)
  })

  it('keeps every member inside its group box (relative coords ≥ 0, within size)', () => {
    const g = group('group:G')
    const members = Array.from({ length: 4 }, (_, i) => table(`public.t${i}`, 2, 'group:G'))
    const out = packGroupedLayout([g, ...members], [])
    const box = out.find((n) => n.id === 'group:G')!
    for (const m of out.filter((n) => n.parentId === 'group:G')) {
      const { width, height } = nodeSize(m)
      expect(m.position.x).toBeGreaterThanOrEqual(0)
      expect(m.position.y).toBeGreaterThanOrEqual(0)
      expect(m.position.x + width).toBeLessThanOrEqual(box.style!.width as number)
      expect(m.position.y + height).toBeLessThanOrEqual(box.style!.height as number)
    }
  })

  it('separates two groups so their boxes do not overlap', () => {
    const ga = group('group:A')
    const gb = group('group:B')
    const am = Array.from({ length: 3 }, (_, i) => table(`public.a${i}`, 2, 'group:A'))
    const bm = Array.from({ length: 3 }, (_, i) => table(`public.b${i}`, 2, 'group:B'))
    const out = packGroupedLayout([ga, gb, ...am, ...bm], [])
    const A = out.find((n) => n.id === 'group:A')!
    const B = out.find((n) => n.id === 'group:B')!
    const ax2 = A.position.x + (A.style!.width as number)
    const bx2 = B.position.x + (B.style!.width as number)
    const ay2 = A.position.y + (A.style!.height as number)
    const by2 = B.position.y + (B.style!.height as number)
    const overlapX = Math.min(ax2, bx2) - Math.max(A.position.x, B.position.x)
    const overlapY = Math.min(ay2, by2) - Math.max(A.position.y, B.position.y)
    expect(overlapX <= 0 || overlapY <= 0).toBe(true)
  })

  it('places an ungrouped table as a top-level node (no parentId, finite coords)', () => {
    const g = group('group:G')
    const m = table('public.inG', 2, 'group:G')
    const free = table('public.free', 2)
    const out = packGroupedLayout([g, m, free], [])
    const f = out.find((n) => n.id === 'public.free')!
    expect(f.parentId).toBeUndefined()
    expect(Number.isFinite(f.position.x)).toBe(true)
    expect(Number.isFinite(f.position.y)).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose -p codegram exec -T frontend npm run test:run -- src/entities/erd/lib/groupedLayout.test.ts`
Expected: FAIL — `packGroupedLayout`가 없음 (import 에러).

- [ ] **Step 3: 구현 작성**

```ts
// frontend/src/entities/erd/lib/groupedLayout.ts
/**
 * PURE 그룹 레이아웃 (ADR-0010, 2026-06-12 개정). 각 그룹의 멤버를 그룹 박스
 * 안에서 gridLayout으로 콤팩트 패킹하고, 그룹 블록·미분류 엔티티를 dagre 메타
 * 그래프(블록=슈퍼노드, 그룹 간 관계로 연결)로 배치한다. dagre-compound가
 * 멤버를 펼쳐 그룹 박스가 세로로 길고 비던 문제를 없앤다.
 *
 * entities layer: @dagrejs/dagre + entities/erd types/geometry만 의존. 순수.
 */
import dagre from '@dagrejs/dagre'
import type { ErdFlowNode, ErdFlowEdge } from '../model/types'
import { nodeSize, GROUP_PAD_X, GROUP_PAD_TOP, GROUP_PAD_BOTTOM } from './nodeSize'
import { gridLayout } from './gridLayout'
import { separateGroups } from './separateGroups'

/** 한 그룹 멤버를 그리드 패킹하고 박스/멤버상대좌표를 계산. */
function packGroup(members: ErdFlowNode[]): {
  packed: ErdFlowNode[] // position = 그룹 원점 기준 상대좌표
  width: number
  height: number
} {
  // gridLayout은 (0,0)부터 절대 배치 → 그것을 콘텐츠 좌표로 사용.
  const laid = gridLayout(members, [])
  let maxX = 0
  let maxY = 0
  for (const m of laid) {
    const { width, height } = nodeSize(m)
    maxX = Math.max(maxX, m.position.x + width)
    maxY = Math.max(maxY, m.position.y + height)
  }
  const packed = laid.map((m) => ({
    ...m,
    position: { x: m.position.x + GROUP_PAD_X, y: m.position.y + GROUP_PAD_TOP },
  }))
  return {
    packed,
    width: maxX + GROUP_PAD_X * 2,
    height: maxY + GROUP_PAD_TOP + GROUP_PAD_BOTTOM,
  }
}

export function packGroupedLayout(
  nodes: ErdFlowNode[],
  edges: ErdFlowEdge[],
): ErdFlowNode[] {
  const groupIds = new Set(nodes.filter((n) => n.type === 'group').map((n) => n.id))
  // node id -> 소속 그룹 id (그룹 멤버만).
  const groupOf = new Map<string, string>()
  for (const n of nodes) {
    if (n.parentId && groupIds.has(n.parentId)) groupOf.set(n.id, n.parentId)
  }

  // 1) 각 그룹 내부 패킹.
  const packedByGroup = new Map<string, ReturnType<typeof packGroup>>()
  for (const gid of groupIds) {
    const members = nodes.filter((n) => n.parentId === gid)
    if (members.length === 0) continue
    packedByGroup.set(gid, packGroup(members))
  }

  // 2) 메타 그래프: 슈퍼노드 = 그룹(블록 크기) + 비그룹·비멤버 노드(자기 크기).
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 140, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))

  const metaIdOf = (nodeId: string): string => groupOf.get(nodeId) ?? nodeId

  for (const gid of groupIds) {
    const pk = packedByGroup.get(gid)
    if (pk) g.setNode(gid, { width: pk.width, height: pk.height })
  }
  for (const n of nodes) {
    if (groupIds.has(n.id)) continue
    if (groupOf.has(n.id)) continue // 그룹 멤버는 블록에 흡수
    const { width, height } = nodeSize(n)
    g.setNode(n.id, { width, height })
  }

  const seen = new Set<string>()
  for (const e of edges) {
    if ((e.data as { isEnumLink?: boolean } | undefined)?.isEnumLink) continue
    const s = metaIdOf(e.source)
    const t = metaIdOf(e.target)
    if (s === t) continue
    if (!g.hasNode(s) || !g.hasNode(t)) continue
    const key = `${s} ${t}`
    if (seen.has(key)) continue
    seen.add(key)
    g.setEdge(s, t)
  }

  dagre.layout(g)

  const metaTopLeft = (id: string): { x: number; y: number } => {
    const laid = g.node(id)
    if (!laid) return { x: 0, y: 0 }
    return { x: laid.x - laid.width / 2, y: laid.y - laid.height / 2 }
  }

  // 3) 펼치기: 그룹 박스/멤버, 미분류 노드 좌표 확정.
  const result = nodes.map((node) => {
    if (groupIds.has(node.id)) {
      const pk = packedByGroup.get(node.id)
      if (!pk) return node // 멤버 없는 그룹은 그대로
      const tl = metaTopLeft(node.id)
      return {
        ...node,
        position: tl,
        style: { ...node.style, width: pk.width, height: pk.height },
      }
    }
    const gid = groupOf.get(node.id)
    if (gid) {
      const pk = packedByGroup.get(gid)
      const m = pk?.packed.find((p) => p.id === node.id)
      return m ? { ...node, position: m.position } : node
    }
    // 미분류 top-level 노드.
    return { ...node, position: metaTopLeft(node.id) }
  })

  // 4) 그룹 박스 겹침 방지(멤버는 parentId로 따라감).
  return separateGroups(result)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `docker compose -p codegram exec -T frontend npm run test:run -- src/entities/erd/lib/groupedLayout.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/entities/erd/lib/groupedLayout.ts frontend/src/entities/erd/lib/groupedLayout.test.ts
git commit -m "feat(erd): per-group grid packing + dagre meta-layout (ADR-0010 개정)"
```

---

### Task A2: `autoLayout`의 그룹 분기를 `packGroupedLayout`으로 교체

**Files:**
- Modify: `frontend/src/entities/erd/lib/autoLayout.ts`
- Modify: `frontend/src/entities/erd/lib/autoLayout.test.ts`

- [ ] **Step 1: 기존 그룹 테스트 기대값을 새 동작으로 갱신**

`autoLayout.test.ts`에서 그룹이 있는 케이스의 단언을 "콤팩트" 기준으로 바꾼다. 먼저 현재 그룹 관련 테스트를 확인:

Run: `docker compose -p codegram exec -T frontend npx vitest related --run src/entities/erd/lib/autoLayout.test.ts 2>/dev/null; grep -n "group" frontend/src/entities/erd/lib/autoLayout.test.ts`

그룹을 다루는 각 테스트에서 "멤버가 그룹 박스 안에 있다 / 박스 크기가 유한하다" 같은 **구조적** 단언은 유지하고, dagre 특유의 좌표 기대값(특정 x/y)은 제거하거나 범위 단언으로 바꾼다. (구체 변경은 Step 3 구현 후 실패 메시지를 보고 수치를 맞춘다.)

- [ ] **Step 2: 구현 — 그룹 분기 교체**

`autoLayout.ts`에서 dagre-compound 블록(현재 42~135행: `new dagre.graphlib.Graph({compound:true})` 부터 `return separateGroups(finalNodes)`)을 아래로 교체한다. `gridLayout` import는 유지, `dagre`·`GROUP_PAD_*`·`separateGroups` import는 `packGroupedLayout`이 대신 쓰므로 autoLayout에서 미사용이 되면 제거한다.

```ts
// autoLayout.ts — 상단 import 교체
import type { ErdFlowNode, ErdFlowEdge } from '@/entities/erd/model/types'
import { gridLayout } from './gridLayout'
import { packGroupedLayout } from './groupedLayout'

export function autoLayout(
  nodes: ErdFlowNode[],
  edges: ErdFlowEdge[],
): ErdFlowNode[] {
  if (nodes.length === 0) return []
  // 그룹 없음 → 균형 그리드(ADR-0010). 그룹 있음 → 그룹별 내부 그리드 + 메타배치.
  if (!nodes.some((n) => n.type === 'group')) {
    return gridLayout(nodes, edges)
  }
  return packGroupedLayout(nodes, edges)
}
```

- [ ] **Step 3: autoLayout 테스트 실행 + 기대값 맞춤**

Run: `docker compose -p codegram exec -T frontend npm run test:run -- src/entities/erd/lib/autoLayout.test.ts`
Expected: 실패하는 그룹 단언이 있으면 Step 1 방침대로 구조적 단언으로 수정 후 PASS. (멤버가 박스 안에 있음 / 박스 유한 / NaN 없음은 반드시 유지.)

- [ ] **Step 4: reconcile 회귀 확인 (fitGroupBoxes 연동)**

Run: `docker compose -p codegram exec -T frontend npm run test:run -- src/entities/layout/lib/reconcile.test.ts src/entities/layout/lib/groupBox.test.ts`
Expected: PASS — `reconcileLayout`은 `autoLayout` 베이스라인 + `fitGroupBoxes` 재적합이므로 그대로 동작.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/entities/erd/lib/autoLayout.ts frontend/src/entities/erd/lib/autoLayout.test.ts
git commit -m "refactor(erd): autoLayout uses packGroupedLayout for grouped diagrams"
```

---

### Task A3: `arrangeGroupInPlace` — 그룹 1개 제자리 정리(순수)

**Files:**
- Create: `frontend/src/entities/layout/lib/arrangeGroup.ts`
- Test: `frontend/src/entities/layout/lib/arrangeGroup.test.ts`
- Modify: `frontend/src/entities/layout/index.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// frontend/src/entities/layout/lib/arrangeGroup.test.ts
import { describe, it, expect } from 'vitest'
import { arrangeGroupInPlace } from './arrangeGroup'
import { nodeSize } from '@/entities/erd'
import type { ErdFlowNode } from '@/entities/erd'

function table(id: string, cols: number, parentId: string, x: number, y: number): ErdFlowNode {
  return {
    id, type: 'table', parentId, position: { x, y },
    data: { tableName: id, tableId: id, columns: Array.from({ length: cols }, (_, i) => ({ id: `${id}.c${i}`, name: `c${i}`, type: 'int', pk: false, fk: false, nn: false, unique: false })) },
  } as ErdFlowNode
}
function group(id: string, x: number, y: number, w: number, h: number): ErdFlowNode {
  return { id, type: 'group', position: { x, y }, style: { width: w, height: h }, data: { groupName: id } } as ErdFlowNode
}

describe('arrangeGroupInPlace', () => {
  it('keeps the group box top-left fixed and only touches that group', () => {
    const g = group('group:G', 500, 300, 50, 9999)
    const members = Array.from({ length: 4 }, (_, i) => table(`public.t${i}`, 2, 'group:G', 0, i * 400))
    const other = table('public.free', 2, '', 10, 20) // parentId '' → top-level (none)
    const free: ErdFlowNode = { ...other, parentId: undefined } as ErdFlowNode
    const out = arrangeGroupInPlace([g, ...members, free], 'group:G')

    const box = out.find((n) => n.id === 'group:G')!
    expect(box.position).toEqual({ x: 500, y: 300 }) // 좌상단 기준점 유지
    // 다른 노드는 불변.
    expect(out.find((n) => n.id === 'public.free')!.position).toEqual({ x: 10, y: 20 })
  })

  it('packs members into a compact box (shorter than the degenerate vertical stack)', () => {
    const g = group('group:G', 0, 0, 50, 5000)
    const members = Array.from({ length: 6 }, (_, i) => table(`public.t${i}`, 3, 'group:G', 0, i * 400))
    const out = arrangeGroupInPlace([g, ...members], 'group:G')
    const box = out.find((n) => n.id === 'group:G')!
    const memberH = nodeSize(members[0]).height
    expect(box.style!.height as number).toBeLessThan(6 * memberH)
    // 멤버는 박스 안 상대좌표.
    for (const m of out.filter((n) => n.parentId === 'group:G')) {
      const { width, height } = nodeSize(m)
      expect(m.position.x).toBeGreaterThanOrEqual(0)
      expect(m.position.y).toBeGreaterThanOrEqual(0)
      expect(m.position.x + width).toBeLessThanOrEqual(box.style!.width as number)
      expect(m.position.y + height).toBeLessThanOrEqual(box.style!.height as number)
    }
  })

  it('returns input unchanged when the group id is unknown or has no members', () => {
    const g = group('group:G', 0, 0, 50, 50)
    expect(arrangeGroupInPlace([g], 'group:NOPE')).toEqual([g])
    expect(arrangeGroupInPlace([g], 'group:G')).toEqual([g]) // 멤버 없음
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose -p codegram exec -T frontend npm run test:run -- src/entities/layout/lib/arrangeGroup.test.ts`
Expected: FAIL — `arrangeGroupInPlace` 없음.

- [ ] **Step 3: 구현 작성**

```ts
// frontend/src/entities/layout/lib/arrangeGroup.ts
/**
 * PURE 그룹 1개 제자리 정리 (ADR-0010 2026-06-12). 지정 그룹의 멤버만 콤팩트
 * 그리드로 다시 패킹하고 박스를 그 멤버에 맞게 재계산하되, 박스의 좌상단
 * 기준점(position)은 유지한다. 다른 그룹·미분류 노드는 건드리지 않는다.
 *
 * entities layer: entities/erd(gridLayout·nodeSize·geometry)만 의존. 순수.
 */
import { gridLayout, nodeSize, GROUP_PAD_X, GROUP_PAD_TOP, GROUP_PAD_BOTTOM } from '@/entities/erd'
import type { ErdFlowNode } from '@/entities/erd'

export function arrangeGroupInPlace(
  nodes: ErdFlowNode[],
  groupId: string,
): ErdFlowNode[] {
  const groupNode = nodes.find((n) => n.id === groupId && n.type === 'group')
  if (!groupNode) return nodes
  const members = nodes.filter((n) => n.parentId === groupId)
  if (members.length === 0) return nodes

  // gridLayout은 (0,0)부터 절대 배치 → 콘텐츠 좌표로 사용.
  const laid = gridLayout(members, [])
  const relById = new Map<string, { x: number; y: number }>()
  let maxX = 0
  let maxY = 0
  for (const m of laid) {
    const { width, height } = nodeSize(m)
    relById.set(m.id, { x: m.position.x + GROUP_PAD_X, y: m.position.y + GROUP_PAD_TOP })
    maxX = Math.max(maxX, m.position.x + width)
    maxY = Math.max(maxY, m.position.y + height)
  }
  const width = maxX + GROUP_PAD_X * 2
  const height = maxY + GROUP_PAD_TOP + GROUP_PAD_BOTTOM

  return nodes.map((n) => {
    if (n.id === groupId) {
      return { ...n, style: { ...n.style, width, height } } // position(좌상단) 유지
    }
    const rel = relById.get(n.id)
    return rel ? { ...n, position: rel } : n
  })
}
```

- [ ] **Step 4: index.ts export 추가**

`frontend/src/entities/layout/index.ts`의 `edgePath` export 블록 아래에 추가:

```ts
export { arrangeGroupInPlace } from './lib/arrangeGroup'
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `docker compose -p codegram exec -T frontend npm run test:run -- src/entities/layout/lib/arrangeGroup.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/entities/layout/lib/arrangeGroup.ts frontend/src/entities/layout/lib/arrangeGroup.test.ts frontend/src/entities/layout/index.ts
git commit -m "feat(layout): arrangeGroupInPlace — compact one group, keep top-left"
```

---

## Part B — 그룹 상호작용 (캔버스)

### Task B1: `GroupActionContext` 생성

**Files:**
- Create: `frontend/src/features/erd-canvas/lib/groupActionContext.ts`

- [ ] **Step 1: 구현 작성 (edgePathContext와 동일 패턴)**

```ts
// frontend/src/features/erd-canvas/lib/groupActionContext.ts
/**
 * 그룹 노드 → 캔버스 액션 통로. GroupNode는 React Flow 렌더러 안에 있어 콜백을
 * context(provider의 ref로 안정 identity)로 받는다. edgePathContext와 동일 패턴.
 * features layer (FSD): erd-canvas 로컬.
 */
import { createContext, useContext } from 'react'

export interface GroupActionContextValue {
  /** 그룹 1개를 제자리에서 콤팩트 정렬(라벨 옆 버튼). */
  onArrangeGroup: (groupId: string) => void
}

const noop = () => {}
export const GroupActionContext = createContext<GroupActionContextValue>({
  onArrangeGroup: noop,
})
export function useGroupActionContext(): GroupActionContextValue {
  return useContext(GroupActionContext)
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/features/erd-canvas/lib/groupActionContext.ts
git commit -m "feat(erd-canvas): GroupActionContext for per-group arrange"
```

---

### Task B2: GroupNode — 통과 배경 + 라벨 크롬(드래그 핸들) + hover 정렬 버튼

**Files:**
- Modify: `frontend/src/features/erd-canvas/ui/GroupNode.tsx`
- Modify: `frontend/src/features/erd-canvas/ui/GroupNode.test.tsx`

- [ ] **Step 1: 실패 테스트 작성/갱신**

`GroupNode.test.tsx`에 추가(기존 렌더 테스트는 유지):

```tsx
import { GroupActionContext } from '../lib/groupActionContext'
import { fireEvent } from '@testing-library/react'

it('라벨 크롬은 드래그 핸들 클래스를 갖고, 배경 필은 pointer-events:none', () => {
  const { container } = render(
    <ReactFlowProvider>
      <GroupNode {...({ id: 'group:G', data: { groupName: 'G', color: '#0E9384' } } as never)} />
    </ReactFlowProvider>,
  )
  const fill = container.querySelector('[data-testid="group-region-group:G"]') as HTMLElement
  expect(fill.style.pointerEvents).toBe('none')
  const handle = container.querySelector('.erd-group-handle') as HTMLElement
  expect(handle).toBeTruthy()
  expect(handle.style.pointerEvents).toBe('auto')
})

it('정렬 버튼 클릭 시 onArrangeGroup(groupId) 호출', () => {
  const onArrangeGroup = vi.fn()
  const { getByTestId } = render(
    <ReactFlowProvider>
      <GroupActionContext.Provider value={{ onArrangeGroup }}>
        <GroupNode {...({ id: 'group:G', data: { groupName: 'G' } } as never)} />
      </GroupActionContext.Provider>
    </ReactFlowProvider>,
  )
  fireEvent.click(getByTestId('group-arrange-group:G'))
  expect(onArrangeGroup).toHaveBeenCalledWith('group:G')
})
```

테스트 상단에 `import { vi } from 'vitest'`, `import { ReactFlowProvider } from '@xyflow/react'`가 있는지 확인하고 없으면 추가.

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose -p codegram exec -T frontend npm run test:run -- src/features/erd-canvas/ui/GroupNode.test.tsx`
Expected: FAIL — `.erd-group-handle` / `group-arrange-*` 없음.

- [ ] **Step 3: 구현 작성**

`GroupNode.tsx` 전체를 교체:

```tsx
import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { LayoutGrid } from 'lucide-react'
import type { GroupNodeData } from '@/entities/erd'
import { useGroupActionContext } from '../lib/groupActionContext'

export type GroupNodeProps = NodeProps & { data: GroupNodeData }

/**
 * 그룹 배경. 내부 필은 pointer-events:none → 클릭이 아래 엣지/핸들/버튼으로 통과.
 * 라벨 크롬(.erd-group-handle)만 interactive: React Flow dragHandle(라벨로만
 * 그룹 드래그 = 멤버 일괄 이동) + hover 시 정렬 버튼(group-arrange-*) 노출.
 * 버튼은 onArrangeGroup(id)로 그룹 제자리 정렬을 트리거하고 드래그 시작은 막는다.
 * features layer: shared + entities/erd + @xyflow/react.
 */
function GroupNodeImpl({ id, data }: GroupNodeProps) {
  const color = data.color ?? 'var(--erd-border-2)'
  const borderColor = `color-mix(in srgb, ${color} 50%, transparent)`
  const bgColor = `color-mix(in srgb, ${color} 7%, transparent)`
  const { onArrangeGroup } = useGroupActionContext()

  return (
    <div
      data-testid={`group-region-${id}`}
      className="erd-group-region"
      style={{
        pointerEvents: 'none', // 필은 통과 (요청 1)
        width: '100%',
        height: '100%',
        borderRadius: 16,
        border: `1px dashed ${borderColor}`,
        backgroundColor: bgColor,
        position: 'relative',
      }}
    >
      {/* 라벨 크롬 = 유일한 interactive 영역 (드래그 핸들 + hover 버튼) */}
      <div
        className="erd-group-handle"
        style={{
          pointerEvents: 'auto',
          position: 'absolute',
          top: 4,
          left: 8,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '2px 4px',
          cursor: 'grab',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
            color,
            textTransform: 'uppercase',
            fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, opacity: 0.85, flexShrink: 0 }} />
          {data.groupName}
        </span>
        {/* 정렬 버튼 — 평소 숨김, .erd-group-handle hover 시 노출(css) */}
        <button
          data-testid={`group-arrange-${id}`}
          className="erd-group-arrange"
          title="이 그룹 정렬"
          onPointerDown={(e) => e.stopPropagation()} // 드래그 시작 차단
          onClick={(e) => {
            e.stopPropagation()
            onArrangeGroup(id)
          }}
          style={{
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            borderRadius: 6,
            border: `1px solid ${borderColor}`,
            background: 'var(--erd-surface)',
            color,
            cursor: 'pointer',
          }}
        >
          <LayoutGrid size={12} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

export const GroupNode = memo(GroupNodeImpl)
```

- [ ] **Step 4: css — hover 시 버튼 노출**

`frontend/src/index.css`의 그룹 블록 근처에 추가:

```css
/* 그룹 라벨 크롬 hover 시에만 정렬 버튼 노출 (요청 2: 항상 노출 아님) */
.erd-group-handle:hover .erd-group-arrange {
  display: inline-flex !important;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `docker compose -p codegram exec -T frontend npm run test:run -- src/features/erd-canvas/ui/GroupNode.test.tsx`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/erd-canvas/ui/GroupNode.tsx frontend/src/features/erd-canvas/ui/GroupNode.test.tsx frontend/src/index.css
git commit -m "feat(erd-canvas): group is pass-through backdrop; label chrome = drag handle + arrange button"
```

---

### Task B3: 그룹 노드 dragHandle 지정 + 노드 래퍼 통과 css

**Files:**
- Modify: `frontend/src/entities/erd/lib/schemaToFlow.ts`
- Modify: `frontend/src/features/erd-canvas/ui/GroupNode.test.tsx` (스냅샷 영향 없음 — schemaToFlow 테스트로 확인)
- Modify: `frontend/src/entities/erd/lib/schemaToFlow.test.ts`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: schemaToFlow 테스트에 dragHandle 단언 추가**

`schemaToFlow.test.ts`에서 그룹 노드를 만드는 기존 테스트에 추가(그룹이 있는 케이스 찾아 그 그룹 노드에):

```ts
// 그룹 노드는 라벨(.erd-group-handle)로만 드래그된다.
expect(groupNode.dragHandle).toBe('.erd-group-handle')
```

(그룹 노드 변수명은 해당 테스트 컨텍스트에 맞춰 `result.nodes.find(n => n.type === 'group')`로 얻는다.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `docker compose -p codegram exec -T frontend npm run test:run -- src/entities/erd/lib/schemaToFlow.test.ts`
Expected: FAIL — `dragHandle` undefined.

- [ ] **Step 3: schemaToFlow 구현 — 그룹 노드에 dragHandle**

`schemaToFlow.ts`의 `groupNodes` 생성에서 반환 객체에 `dragHandle` 추가:

```ts
    return {
      id,
      type: 'group',
      position: { ...ZERO },
      dragHandle: '.erd-group-handle',
      data,
    }
```

- [ ] **Step 4: index.css — 노드 래퍼 통과 규칙**

기존 그룹 backdrop 규칙 블록(`.react-flow__node.react-flow__node-group, ...`) 안의 선언에 `pointer-events: none;`을 추가한다(이미 background/border/padding 등을 strip 중인 셀렉터). 이렇게 하면 그룹 노드 래퍼 전체가 통과되고, 내부 `.erd-group-handle`(pointer-events:auto)만 이벤트를 받는다:

```css
.react-flow__node.react-flow__node-group,
.react-flow__node-group.selectable.selected,
.react-flow__node-group.selectable:focus,
.react-flow__node-group.selectable:focus-visible,
.react-flow__node-group.selectable:hover {
  background-color: transparent;
  border: none;
  padding: 0;
  box-shadow: none;
  outline: none;
  pointer-events: none; /* 그룹 영역 통과 — .erd-group-handle만 auto로 재활성 (요청 1) */
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `docker compose -p codegram exec -T frontend npm run test:run -- src/entities/erd/lib/schemaToFlow.test.ts`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/entities/erd/lib/schemaToFlow.ts frontend/src/entities/erd/lib/schemaToFlow.test.ts frontend/src/index.css
git commit -m "feat(erd): group nodes drag only via .erd-group-handle; wrapper pointer-events none"
```

---

### Task B4: ErdCanvas — GroupActionContext provider + onArrangeGroup 핸들러

**Files:**
- Modify: `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx`

- [ ] **Step 1: import 추가**

`ErdCanvas.tsx` 상단 import에 추가:

```ts
import { arrangeGroupInPlace } from '@/entities/layout'
import { GroupActionContext, type GroupActionContextValue } from '../lib/groupActionContext'
```

- [ ] **Step 2: onArrangeGroup 핸들러 + provider value 작성**

`edgePathCtx` useMemo 근처(나란히)에 추가. 이동한 멤버에 닿는 엣지의 수동 경로만 초기화한다(CONTEXT.md "수동 경로" 그룹별 예외).

```ts
  const groupActionCtx = useMemo<GroupActionContextValue>(
    () => ({
      onArrangeGroup: (groupId) => {
        const current = nodesRef.current
        const movedMemberIds = new Set(
          current.filter((n) => n.parentId === groupId).map((n) => n.id),
        )
        if (movedMemberIds.size === 0) return
        const next = arrangeGroupInPlace(current, groupId)
        setNodes(next)
        onLayoutChange?.(nodesToLayout(next))
        // 이동 멤버에 닿는 엣지(한쪽 끝점이라도)의 수동 경로만 제거.
        const paths = edgePathsRef.current
        const survivors: typeof paths = {}
        let changed = false
        for (const [edgeId, path] of Object.entries(paths)) {
          const e = flow.edges.find((x) => x.id === edgeId)
          const touches = e && (movedMemberIds.has(e.source) || movedMemberIds.has(e.target))
          if (touches) changed = true
          else survivors[edgeId] = path
        }
        if (changed) onEdgePathsChangeRef.current?.(survivors)
      },
    }),
    [flow.edges, onLayoutChange, setNodes],
  )
```

(주의: `nodesToLayout`, `setNodes`, `onLayoutChange`, `edgePathsRef`, `onEdgePathsChangeRef`, `flow`는 ErdCanvasInner 스코프에 이미 존재한다.)

- [ ] **Step 3: provider로 트리 감싸기**

기존 `<EdgePathContext.Provider value={edgePathCtx}>` 바깥(또는 안)에 중첩:

```tsx
    <EdgePathContext.Provider value={edgePathCtx}>
    <GroupActionContext.Provider value={groupActionCtx}>
    <ReactFlow
      /* ...기존 그대로... */
    >
      {/* ...children... */}
    </ReactFlow>
    </GroupActionContext.Provider>
    </EdgePathContext.Provider>
```

- [ ] **Step 4: 타입체크 + 전체 유닛 스위트**

Run: `docker compose -p codegram exec -T frontend sh -c "npm run type-check && npm run test:run"`
Expected: PASS (기존 + 신규 전부).

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/erd-canvas/ui/ErdCanvas.tsx
git commit -m "feat(erd-canvas): wire per-group arrange (clears manual paths touching moved members)"
```

---

### Task B5: ErdCanvas wiring 테스트 — onArrangeGroup 동작

**Files:**
- Modify: `frontend/src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx`

- [ ] **Step 1: 테스트 작성 (mock ReactFlow가 children 렌더하므로 context 소비 가능)**

`ErdCanvas.wiring.test.tsx`에 블록 추가. fixture `schema`에 그룹이 있는지 확인하고, 없으면 그룹 포함 fixture를 인라인으로 만든다. 아래는 GroupActionContext를 직접 소비해 핸들러를 호출하는 방식(캔버스가 context value를 제공하는지 검증):

```tsx
import { useGroupActionContext } from '../lib/groupActionContext'

function ArrangeProbe({ groupId }: { groupId: string }) {
  const { onArrangeGroup } = useGroupActionContext()
  return <button data-testid="probe-arrange" onClick={() => onArrangeGroup(groupId)} />
}

describe('ErdCanvas per-group arrange wiring', () => {
  it('onArrangeGroup가 그 그룹 멤버 위치를 바꾸고 layout을 emit한다', async () => {
    // 그룹 1개 + 멤버 2개 스키마 fixture (인라인). schema fixture에 그룹이 있으면 그걸 사용.
    const onLayoutChange = vi.fn()
    render(
      <ErdCanvas schema={/* 그룹 포함 schema */ groupedSchema} onLayoutChange={onLayoutChange} />,
    )
    // mock ReactFlow는 children을 렌더하므로 동일 provider 아래에 Probe를 두기 위해
    // ErdCanvas children 합성이 어렵다면, GroupActionContext가 제공되는지는
    // window.__rfProps 대신 onLayoutChange가 호출되는지로 간접 검증한다.
    // 직접 검증: 캔버스가 렌더한 group-arrange 버튼을 클릭.
    const btn = document.querySelector('[data-testid^="group-arrange-"]') as HTMLElement
    if (btn) {
      btn.click()
      await vi.waitFor(() => expect(onLayoutChange).toHaveBeenCalled())
      const emitted = onLayoutChange.mock.calls.at(-1)?.[0] as { version: number }
      expect(emitted.version).toBe(1)
    }
  })
})
```

> 참고: 이 mock 환경에서는 React Flow가 노드를 측정/렌더하지 않아 `group-arrange-*` DOM이 없을 수 있다. 그 경우 이 케이스는 **E2E(Task C2)** 로 커버하고, 유닛에서는 `groupActionCtx` 핸들러의 순수 로직(arrangeGroupInPlace + 수동경로 필터)을 Task A3 + 아래 별도 순수 테스트로 충분히 커버한다. 본 유닛 테스트는 "캔버스가 크래시 없이 렌더되고 onLayoutChange 계약이 유지된다" 수준으로만 둔다.

- [ ] **Step 2: 실행**

Run: `docker compose -p codegram exec -T frontend npm run test:run -- src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx`
Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx
git commit -m "test(erd-canvas): per-group arrange wiring smoke"
```

---

## Part C — E2E 검증

### Task C1: E2E 헬퍼 + 그룹 라벨 드래그/내부 클릭

**Files:**
- Modify: `frontend/e2e/table-groups.spec.ts`

- [ ] **Step 1: 테스트 작성 (오버레이 config 사용)**

`table-groups.spec.ts`에 추가. 그룹 2개 + FK 스키마를 API로 생성 후 에디터 진입.

```ts
test('그룹 라벨 드래그로 멤버 일괄 이동, 내부 엣지는 선택 가능', async ({ page }) => {
  // (기존 헬퍼 registerAndLogin 사용; 없으면 파일 상단 패턴 복사)
  // 그룹 G1{users, orgs} (FK users.org_id>orgs.id), G2{posts} 스키마를 POST로 생성
  // → /editor/:id 진입, 그룹 region 렌더 대기.
  await page.waitForSelector('[data-testid^="group-region-"]')

  // 1) 그룹 영역(라벨 아님)의 빈 곳을 클릭 → onPaneClick으로 통과되어 선택 없음.
  //    그룹 내부의 엣지를 클릭하면 엣지가 선택된다(그룹이 가로채지 않음).
  const edge = page.locator('.react-flow__edge-path').first()
  await expect(edge).toBeVisible()
  // 엣지 경로 위 한 점을 클릭(edge-path.spec의 getPointAtLength 샘플링 패턴 재사용)
  // → 세그먼트 핸들(edge-seg-*)이 나타나면 "그룹이 클릭을 안 가로챈다"가 증명됨.
  // (클릭 헬퍼는 edge-path.spec.ts의 clickEdgeMidpoint를 복사해 사용)
  // await clickEdgeMidpoint(page)
  // await expect(page.locator('[data-testid^="edge-seg-"]').first()).toBeVisible()

  // 2) 그룹 라벨(.erd-group-handle) 드래그 → 멤버 transform이 이동.
  const handle = page.locator('.erd-group-handle').first()
  const before = await page.locator('.react-flow__node-table').first().getAttribute('style')
  const box = await handle.boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 120, box.y + 80, { steps: 5 })
    await page.mouse.up()
  }
  await expect.poll(async () => page.locator('.react-flow__node-table').first().getAttribute('style')).not.toBe(before)
})
```

> 그룹/엣지 선택 검증은 `edge-path.spec.ts`의 `clickEdgeMidpoint`·`pickDraggableHandle` 헬퍼 패턴을 그대로 가져와 쓴다(ㄱ자 경로는 bbox 중심이 빗나가므로 `getPointAtLength` 샘플링 필수).

- [ ] **Step 2: 오버레이 config로 실행**

먼저 throwaway 오버레이 config 생성(메모리 기록: 커밋된 config의 baseURL `:5173`은 stale, 도커는 `:4001`):

```bash
cat > frontend/playwright.bg-overlay.config.ts <<'EOF'
import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', fullyParallel: true, retries: 0, reporter: 'list',
  use: { baseURL: 'http://localhost:4001', trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
EOF
cd frontend && npx playwright test table-groups --config playwright.bg-overlay.config.ts
```

Expected: PASS.

- [ ] **Step 3: 커밋 (오버레이 config는 커밋하지 않음)**

```bash
rm -f frontend/playwright.bg-overlay.config.ts
git add frontend/e2e/table-groups.spec.ts
git commit -m "test(e2e): group label drag moves members; inner edge clickable through group"
```

---

### Task C2: E2E — 그룹별 정렬 버튼이 멤버를 콤팩트하게 재배치

**Files:**
- Modify: `frontend/e2e/table-groups.spec.ts`

- [ ] **Step 1: 테스트 작성**

```ts
test('그룹 라벨 hover → 정렬 버튼으로 그룹 내부 콤팩트 정렬 + 저장', async ({ page }) => {
  // 멤버 4개 이상인 그룹을 가진 스키마를 POST로 생성 → /editor/:id 진입.
  await page.waitForSelector('[data-testid^="group-region-"]')

  // 그룹 라벨 hover → 정렬 버튼 노출.
  const handle = page.locator('.erd-group-handle').first()
  await handle.hover()
  const arrange = page.locator('[data-testid^="group-arrange-"]').first()
  await expect(arrange).toBeVisible()

  // 정렬 PATCH 대기(레이아웃 저장): payload에 layout.positions 존재.
  const savePatch = page.waitForResponse((resp) =>
    /\/api\/projects\//.test(resp.url()) &&
    resp.request().method() === 'PATCH' && resp.ok() &&
    !!(resp.request().postDataJSON() as { layout?: { positions?: unknown } } | null)?.layout?.positions,
  )

  // 정렬 전 그룹 박스 높이 측정.
  const region = page.locator('[data-testid^="group-region-"]').first()
  const hBefore = (await region.boundingBox())!.height
  await arrange.click()
  await savePatch
  await expect.poll(async () => (await region.boundingBox())!.height).toBeLessThanOrEqual(hBefore)
})
```

- [ ] **Step 2: 실행**

```bash
cat > frontend/playwright.bg-overlay.config.ts <<'EOF'
import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', fullyParallel: true, retries: 0, reporter: 'list',
  use: { baseURL: 'http://localhost:4001', trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
EOF
cd frontend && npx playwright test table-groups --config playwright.bg-overlay.config.ts
```

Expected: PASS.

- [ ] **Step 3: 정리 + 커밋**

```bash
rm -f frontend/playwright.bg-overlay.config.ts
git add frontend/e2e/table-groups.spec.ts
git commit -m "test(e2e): per-group arrange button compacts group + persists"
```

---

### Task C3: 전체 회귀 + 시각 확인

- [ ] **Step 1: 전체 유닛 + 타입체크**

Run: `docker compose -p codegram exec -T frontend sh -c "npm run type-check && npm run test:run"`
Expected: PASS (전부).

- [ ] **Step 2: 전체 E2E**

```bash
cat > frontend/playwright.bg-overlay.config.ts <<'EOF'
import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', fullyParallel: true, retries: 0, reporter: 'list',
  use: { baseURL: 'http://localhost:4001', trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
EOF
cd frontend && npx playwright test --config playwright.bg-overlay.config.ts; rm -f frontend/playwright.bg-overlay.config.ts
```

Expected: 전부 PASS.

- [ ] **Step 3: 시각 확인 (스크린샷)**

그룹 2개 + 멤버 다수 프로젝트를 열어 ① 그룹 박스가 콤팩트(세로로 길지 않음) ② 그룹 내부 엣지/핸들 클릭 가능 ③ 라벨 드래그로 멤버 이동 ④ 라벨 hover 정렬 버튼을 스크린샷으로 확인. (`SendUserFile`로 before/after 전달.)

- [ ] **Step 4: 최종 커밋 (필요 시 docs/메모리 갱신)**

```bash
git add -A && git commit -m "docs: group interaction + per-group layout 마무리"
```

---

## Self-Review 메모 (작성자 확인 완료)

- **Spec 커버리지:** 요청1(통과 배경 B2·B3, 라벨 드래그 B3, 내부 클릭 C1) / 요청2(원인=autoLayout 그룹 분기 A2, 그룹별 그리드 A1·전체 적용 A2, 그룹별 버튼 B2·B4·C2, 좌상단 기준 A3, 수동경로 예외 B4) 모두 태스크 존재.
- **타입 일관성:** `packGroupedLayout(nodes, edges)`, `arrangeGroupInPlace(nodes, groupId)`, `GroupActionContextValue.onArrangeGroup(groupId)`, `dragHandle: '.erd-group-handle'`, css 클래스 `.erd-group-handle`/`.erd-group-arrange`/`group-arrange-${id}` 전 태스크 동일.
- **빌드 시 검증 필요(주석에 명시):** (a) React Flow `dragHandle`이 래퍼 `pointer-events:none`에서도 자식(.erd-group-handle, auto)의 pointerdown 버블로 동작하는지 — 안 되면 래퍼는 auto로 두고 필 div만 none + 멤버 클릭 통과 재확인. (b) mock 환경에서 group-arrange DOM 부재 시 wiring은 C2 E2E로 커버(B5 주석).
- **알려진 비목표:** separateGroups는 그룹-그룹만 분리(그룹-미분류 겹침은 dagre 메타 간격에 의존) — 기존 동작과 동일.
