# 캔버스 노트 표시 배율 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 캔버스의 스티키 노트를 우하단 핸들로 1.0~3.0배까지 키울 수 있게 하고(폰트·패딩·테두리가 함께 확대), 그 배율을 프로젝트 layout에 영속화한다.

**Architecture:** 노트 카드에 명시 width/height를 주지 않는다. 인라인 CSS 변수 `--note-scale`을 걸고 모든 기하를 `calc(토큰 × var(--note-scale))`로 표현하므로 실제 border-box가 배율만큼 커지고 React Flow의 `measured`가 정확해진다(엣지 장애물·선택 링·A* 라우팅이 코드 변경 없이 따라옴). 배율은 `StoredPosition.scale`로 layout JSONB에 저장한다. 조작은 `NodeResizer`가 아니라 자체 포인터 핸들이다 — RF 리사이저는 "노드에 명시 치수를 쓴다"는 계약이라 고유크기 모델과 충돌한다.

**Tech Stack:** React 19 + TypeScript, @xyflow/react v12, Tailwind + `--erd-*` CSS 변수, vitest + @testing-library/react, Playwright.

## Global Constraints

- 설계 근거: [ADR-0026](../../adr/0026-note-display-scale-in-layout.md) · 스펙: [2026-07-31-canvas-note-scale-design.md](../specs/2026-07-31-canvas-note-scale-design.md)
- 배율 범위는 `1.0 ~ 3.0`. 하한 1.0 = 기존 기본 크기(축소 없음).
- FSD import 방향 엄수: `shared ← entities ← features ← widgets ← pages ← app`. `entities/*`는 React·React Flow **런타임**을 import하지 않는다(타입만).
- raw 색·폰트 크기 금지(F5/ADR-0020). 새 치수 값은 `src/index.css`에 토큰으로 정의하고 컴포넌트는 `var()`로 소비한다.
- 사용자 노출 문자열은 `t('key')`로만. 키는 `src/shared/i18n/locales/ko.json`·`en.json` **양쪽에** 먼저 추가한다(F4).
- 읽기 모드에서는 편집 어포던스를 **DOM에 렌더하지 않는다**(ADR-0025). 게이트는 `useCanvasReadOnly()`.
- 타입 체크는 `npx tsc -p tsconfig.app.json --noEmit`. `npm run type-check`는 루트 `files: []`라 **no-op이다.** tsbuildinfo 캐시가 에러를 억제하므로 재실행 전 `rm -f node_modules/.tmp/tsconfig.app.tsbuildinfo`.
- 타입 체크에는 **사전 존재 에러 3건**이 있다(내 변경과 무관). 새로 늘어났는지만 본다(G4).
- 모든 명령은 `frontend/`에서 실행한다.

---

### Task 1: layout에 배율 축을 낸다 (저장·복원 왕복)

배율의 정본은 노드 `data.scale`이고 layout은 그 영속 사본이다. `nodesToLayout`이 `data.scale`을 써 내리지 않으면 **이후 아무 노드 드래그 한 번으로 배율이 조용히 소실된다** — 이 왕복이 기능 전체의 유일한 취약점이므로 가장 먼저 테스트로 고정한다.

**Files:**
- Modify: `src/entities/layout/model/types.ts` (`StoredPosition`)
- Modify: `src/entities/erd/model/types.ts` (`StickyNodeData`)
- Modify: `src/entities/layout/lib/reconcile.ts` (`nodesToLayout`, `reconcileLayout`)
- Test: `src/entities/layout/lib/reconcile.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `StoredPosition.scale?: number` — 1.0 초과일 때만 기록되는 표시 배율
  - `StickyNodeData.scale?: number` — 노드 data의 배율(없음 = 1.0)
  - `nodesToLayout(nodes: ErdFlowNode[]): StoredLayout` — 시그니처 불변, sticky의 `data.scale`을 함께 기록
  - `reconcileLayout(flowNodes, flowEdges, stored): ErdFlowNode[]` — 시그니처 불변, stored `scale`을 sticky `data.scale`로 주입

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/entities/layout/lib/reconcile.test.ts` 맨 아래(기존 `describe('nodesToLayout')` 블록 **뒤**)에 픽스처와 describe를 추가한다. 파일 상단 import에 `StickyNodeData`를 더한다:

```ts
import type { ErdFlowNode, ErdFlowEdge, StickyNodeData } from '@/entities/erd'
```

```ts
/** Standalone note node. Notes are never grouped, so always top-level. */
function stickyNode(id: string, scale?: number): ErdFlowNode {
  return {
    id,
    type: 'sticky',
    position: { x: 0, y: 0 },
    data: { title: id, content: 'memo', ...(scale !== undefined ? { scale } : {}) },
  }
}

describe('note display scale (ADR-0026)', () => {
  it('records a sticky note scale above 1 in its position entry', () => {
    const note = stickyNode('note:history', 1.8)
    note.position = { x: 40, y: 60 }
    const out = nodesToLayout([note])
    expect(out.positions['note:history']).toEqual({ x: 40, y: 60, scale: 1.8 })
  })

  it('omits scale when the note is at the default size', () => {
    const plain = stickyNode('note:plain')
    const explicitOne = stickyNode('note:one', 1)
    const out = nodesToLayout([plain, explicitOne])
    expect('scale' in out.positions['note:plain']).toBe(false)
    expect('scale' in out.positions['note:one']).toBe(false)
  })

  it('never records scale for non-sticky nodes', () => {
    const table = tableNode('public.users')
    const out = nodesToLayout([table])
    expect('scale' in out.positions['public.users']).toBe(false)
  })

  it('injects a stored scale into the note data on reconcile', () => {
    const out = reconcileLayout([stickyNode('note:history')], [], {
      'note:history': { x: 40, y: 60, scale: 2.5 },
    })
    const note = out.find((n) => n.id === 'note:history')!
    expect((note.data as StickyNodeData).scale).toBe(2.5)
    expect(note.position).toEqual({ x: 40, y: 60 })
  })

  it('leaves note data untouched when nothing is stored', () => {
    const out = reconcileLayout([stickyNode('note:history')], [], {})
    const note = out.find((n) => n.id === 'note:history')!
    expect((note.data as StickyNodeData).scale).toBeUndefined()
    expect((note.data as StickyNodeData).title).toBe('note:history')
  })

  it('round-trips the scale through save and restore', () => {
    const note = stickyNode('note:history', 2.25)
    note.position = { x: 10, y: 20 }
    const saved = nodesToLayout([note])
    const restored = reconcileLayout([stickyNode('note:history')], [], saved.positions)
    const back = restored.find((n) => n.id === 'note:history')!
    expect((back.data as StickyNodeData).scale).toBe(2.25)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm run test:run -- src/entities/layout/lib/reconcile.test.ts`
Expected: FAIL — `records a sticky note scale above 1…`이 `{ x: 40, y: 60 }`을 받아 `scale` 누락으로 실패. `injects a stored scale…`은 `undefined`를 받아 실패. 타입 에러(`scale` 없음)로 실패해도 정상이다.

- [ ] **Step 3: 타입에 배율 축을 낸다**

`src/entities/layout/model/types.ts` — `StoredPosition`에 필드를 추가한다:

```ts
export interface StoredPosition {
  x: number
  y: number
  /** Group node id this position is relative to, if the node was grouped at save time. */
  parentId?: string
  /**
   * 노트의 표시 배율(ADR-0026). 1.0(기본 크기) 초과일 때만 기록한다 — 없음 = 1.0.
   * 노트 전용이며 다른 노드 종류에는 기록되지 않는다.
   */
  scale?: number
}
```

`src/entities/erd/model/types.ts` — `StickyNodeData`에 추가한다:

```ts
export interface StickyNodeData {
  title: string
  content: string
  headerColor?: string
  /** 표시 배율(ADR-0026). 없음 = 1.0. 정본은 이 필드이고 layout은 영속 사본이다. */
  scale?: number
  [key: string]: unknown
}
```

- [ ] **Step 4: 왕복을 구현한다**

`src/entities/layout/lib/reconcile.ts` — 상단 타입 import에 `StickyNodeData`를 더한다:

```ts
import type { ErdFlowNode, ErdFlowEdge, StickyNodeData } from '@/entities/erd'
```

`nodesToLayout`의 루프 본문을 고친다(그룹 분기는 그대로):

```ts
    const scale = node.type === 'sticky' ? (node.data as StickyNodeData).scale : undefined
    positions[node.id] = {
      x: node.position.x,
      y: node.position.y,
      ...(node.parentId ? { parentId: node.parentId } : {}),
      // 기본 크기(1.0)는 기록하지 않는다 — 저장 최소화 + 기존 프로젝트와 동일 형태 유지.
      ...(typeof scale === 'number' && scale > 1 ? { scale } : {}),
    }
```

`reconcileLayout`의 step-2 `overridden` 맵에서 sticky 분기를 더한다. 기존 `if (!frameMatches(...)) return node` 뒤, 마지막 `return`을 대체한다:

```ts
    const positioned = { ...node, position: { x: entry.x, y: entry.y } }
    // 노트만 표시 배율을 갖는다(ADR-0026). 노트는 그룹 멤버가 될 수 없으므로 프레임 가드
    // 통과 여부와 무관하게 이 지점에서만 주입하면 충분하다.
    if (node.type === 'sticky' && typeof entry.scale === 'number') {
      return {
        ...positioned,
        data: { ...(node.data as StickyNodeData), scale: entry.scale },
      }
    }
    return positioned
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npm run test:run -- src/entities/layout/lib/reconcile.test.ts`
Expected: PASS — 신규 6개 + 기존 케이스 전부.

- [ ] **Step 6: 타입 체크**

```bash
rm -f node_modules/.tmp/tsconfig.app.tsbuildinfo
npx tsc -p tsconfig.app.json --noEmit
```
Expected: 사전 존재 에러 3건만. 새 에러 0건.

- [ ] **Step 7: 커밋**

```bash
git add src/entities/layout/model/types.ts src/entities/erd/model/types.ts \
        src/entities/layout/lib/reconcile.ts src/entities/layout/lib/reconcile.test.ts
git commit -m "feat(layout): 노트의 표시 배율을 저장·복원 왕복에 태운다"
```

---

### Task 2: 배율의 단일 출처와 자동배치 반영

배율 clamp는 렌더(features)와 배치 계산(entities/erd) 양쪽이 필요하므로 `entities/erd`에 둔다(features → entities는 허용되는 하향 import). dagre가 노트를 여전히 220×120으로 보면 커진 노트 주변 배치 여유가 부족해진다.

**Files:**
- Create: `src/entities/erd/lib/noteScale.ts`
- Create: `src/entities/erd/lib/noteScale.test.ts`
- Modify: `src/entities/erd/lib/nodeSize.ts`
- Modify: `src/entities/erd/index.ts` (re-export)
- Create: `src/entities/erd/lib/nodeSize.test.ts`
- Test: `src/entities/erd/lib/autoLayout.test.ts` (배율 보존 케이스 추가)

**Interfaces:**
- Consumes: `StickyNodeData.scale?: number` (Task 1)
- Produces:
  - `NOTE_SCALE_MIN = 1`, `NOTE_SCALE_MAX = 3`
  - `clampNoteScale(scale: number | undefined): number` — 비수(非數)·범위 밖·`undefined`를 전부 `[1, 3]`으로 정규화
  - `nodeSize(node)` — sticky일 때 `{ width: STICKY_WIDTH * s, height: STICKY_HEIGHT * s }`
  - 위 세 심볼은 `@/entities/erd`에서 import 가능

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/entities/erd/lib/noteScale.test.ts` (신규):

```ts
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
```

`src/entities/erd/lib/nodeSize.test.ts` (신규):

```ts
import { describe, it, expect } from 'vitest'
import { nodeSize, STICKY_WIDTH, STICKY_HEIGHT } from './nodeSize'
import type { ErdFlowNode } from '../model/types'

function stickyNode(scale?: number): ErdFlowNode {
  return {
    id: 'note:history',
    type: 'sticky',
    position: { x: 0, y: 0 },
    data: { title: 'history', content: 'memo', ...(scale !== undefined ? { scale } : {}) },
  }
}

describe('nodeSize (sticky note)', () => {
  it('reports the base box at the default scale', () => {
    expect(nodeSize(stickyNode())).toEqual({
      width: STICKY_WIDTH,
      height: STICKY_HEIGHT,
    })
  })

  it('scales both axes by the note scale', () => {
    expect(nodeSize(stickyNode(2))).toEqual({
      width: STICKY_WIDTH * 2,
      height: STICKY_HEIGHT * 2,
    })
  })

  it('clamps an out-of-range stored scale', () => {
    expect(nodeSize(stickyNode(99))).toEqual({
      width: STICKY_WIDTH * 3,
      height: STICKY_HEIGHT * 3,
    })
  })
})
```

`src/entities/erd/lib/autoLayout.test.ts` — 파일 맨 아래에 추가한다(자동 정렬이 배율을 보존한다 = ADR-0026 결정):

```ts
describe('autoLayout (note scale)', () => {
  it('preserves a note display scale while repositioning', () => {
    const nodes = [
      {
        id: 'public.users',
        type: 'table' as const,
        position: { x: 0, y: 0 },
        data: { tableName: 'public.users', tableId: 'public.users', columns: [] },
      },
      {
        id: 'note:history',
        type: 'sticky' as const,
        position: { x: 0, y: 0 },
        data: { title: 'history', content: 'memo', scale: 2.5 },
      },
    ]
    const out = autoLayout(nodes, [])
    const note = out.find((n) => n.id === 'note:history')!
    expect((note.data as { scale?: number }).scale).toBe(2.5)
  })
})
```

> `autoLayout.test.ts` 상단에 이미 `autoLayout` import와 `describe`가 있다. 없으면 `import { describe, it, expect } from 'vitest'` / `import { autoLayout } from './autoLayout'`을 더한다. 노드 리터럴의 타입이 맞지 않으면 `as ErdFlowNode[]`로 캐스트한다(테스트 픽스처).

- [ ] **Step 2: 실패를 확인한다**

```bash
npm run test:run -- src/entities/erd/lib/noteScale.test.ts src/entities/erd/lib/nodeSize.test.ts src/entities/erd/lib/autoLayout.test.ts
```
Expected: FAIL — `noteScale.ts`가 없어 모듈 해석 실패, `nodeSize` 배율 케이스는 220×120을 받아 실패. `autoLayout` 배율 보존은 이미 통과할 수 있다(`{...node}` 스프레드) — 통과하면 그대로 두고 회귀 방지용으로 남긴다.

- [ ] **Step 3: 배율 단일 출처를 만든다**

`src/entities/erd/lib/noteScale.ts` (신규):

```ts
/**
 * 노트 표시 배율의 단일 출처(ADR-0026). 렌더(features/erd-canvas)와 배치 계산
 * (nodeSize → dagre)이 같은 범위·정규화를 봐야 하므로 entities/erd에 둔다.
 * PURE, no side effects (FSD).
 */

/** 하한 = 기존 기본 크기. 축소는 제공하지 않는다(읽을 수 없는 노트는 노트가 아니다). */
export const NOTE_SCALE_MIN = 1
/** 상한. 그 이상은 노트가 도면을 잡아먹는다. */
export const NOTE_SCALE_MAX = 3

/** 저장값·입력값을 [MIN, MAX]로 정규화한다. 없음/비수 → MIN. */
export function clampNoteScale(scale: number | undefined): number {
  if (typeof scale !== 'number' || Number.isNaN(scale)) return NOTE_SCALE_MIN
  return Math.min(NOTE_SCALE_MAX, Math.max(NOTE_SCALE_MIN, scale))
}
```

- [ ] **Step 4: nodeSize가 배율을 본다**

`src/entities/erd/lib/nodeSize.ts` — 상단 import를 더하고 sticky 분기를 갈라낸다:

```ts
import type { ErdFlowNode } from '@/entities/erd/model/types'
import { clampNoteScale } from './noteScale'
```

함수 끝 폴백을 고친다:

```ts
  if (node.type === 'sticky') {
    // 노트는 배율만큼 실제로 커진다(ADR-0026) — dagre가 그 크기로 여유를 잡아야 한다.
    const s = clampNoteScale((node.data as { scale?: number }).scale)
    return { width: STICKY_WIDTH * s, height: STICKY_HEIGHT * s }
  }
  // group falls back to a fixed box (re-sized post-layout).
  return { width: STICKY_WIDTH, height: STICKY_HEIGHT }
```

- [ ] **Step 5: 배럴에서 내보낸다**

`src/entities/erd/index.ts`에 re-export를 더한다(기존 `nodeSize` 계열 export 줄 옆):

```ts
export { NOTE_SCALE_MIN, NOTE_SCALE_MAX, clampNoteScale } from './lib/noteScale'
```

- [ ] **Step 6: 통과를 확인한다**

```bash
npm run test:run -- src/entities/erd/lib/noteScale.test.ts src/entities/erd/lib/nodeSize.test.ts src/entities/erd/lib/autoLayout.test.ts
```
Expected: PASS 전부.

- [ ] **Step 7: 커밋**

```bash
git add src/entities/erd/lib/noteScale.ts src/entities/erd/lib/noteScale.test.ts \
        src/entities/erd/lib/nodeSize.ts src/entities/erd/lib/nodeSize.test.ts \
        src/entities/erd/index.ts src/entities/erd/lib/autoLayout.test.ts
git commit -m "feat(erd): 노트 배율을 배치 계산에 반영하고 범위를 한곳에 세운다"
```

---

### Task 3: 노트 기하 토큰 + 배율 렌더 (핸들 없이)

카드에 명시 치수를 주지 않고 `--note-scale`로 전부 파생시킨다. 현재 `StickyNote.tsx`의 raw 값(`min-w-[160px]`·`max-w-[260px]`·`px-3`·`py-1.5`·`rounded`)을 `index.css` 토큰으로 회수한다(F5). 이 태스크까지는 화면 동작이 바뀌지 않는다 — 배율이 항상 1이므로 픽셀 단위로 기존과 동일해야 한다.

**Files:**
- Modify: `src/index.css` (`:root` 토큰 블록)
- Modify: `src/features/erd-canvas/ui/StickyNote.tsx`
- Test: `src/features/erd-canvas/ui/StickyNote.test.tsx`

**Interfaces:**
- Consumes: `clampNoteScale` (Task 2), `StickyNodeData.scale` (Task 1)
- Produces:
  - 카드 루트에 `data-testid="sticky-note-${id}"`와 인라인 커스텀 프로퍼티 `--note-scale`
  - 신규 CSS 토큰: `--erd-note-min-w`, `--erd-note-max-w`, `--erd-note-pad-x`, `--erd-note-pad-y`, `--erd-note-radius`, `--erd-note-border-w`, `--erd-note-handle`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/features/erd-canvas/ui/StickyNote.test.tsx`의 `describe('StickyNote')` 안에 추가한다:

```ts
  it('carries the note scale as an inline custom property', () => {
    const { container } = renderNode({
      ...baseProps,
      data: { title: 'Onboarding', content: 'text', scale: 1.8 },
    } as StickyNoteProps)
    const card = container.querySelector<HTMLElement>(
      '[data-testid="sticky-note-note:Onboarding"]',
    )!
    expect(card.style.getPropertyValue('--note-scale')).toBe('1.8')
  })

  it('defaults to scale 1 when the note has none', () => {
    const { container } = renderNode({
      ...baseProps,
      data: { title: 'Onboarding', content: 'text' },
    } as StickyNoteProps)
    const card = container.querySelector<HTMLElement>(
      '[data-testid="sticky-note-note:Onboarding"]',
    )!
    expect(card.style.getPropertyValue('--note-scale')).toBe('1')
  })

  it('clamps a corrupt stored scale into range', () => {
    const { container } = renderNode({
      ...baseProps,
      data: { title: 'Onboarding', content: 'text', scale: 99 },
    } as StickyNoteProps)
    const card = container.querySelector<HTMLElement>(
      '[data-testid="sticky-note-note:Onboarding"]',
    )!
    expect(card.style.getPropertyValue('--note-scale')).toBe('3')
  })

  it('derives every dimension from the scale (no raw px in the card)', () => {
    const { container } = renderNode({
      ...baseProps,
      data: { title: 'Onboarding', content: 'text', scale: 2 },
    } as StickyNoteProps)
    const card = container.querySelector<HTMLElement>(
      '[data-testid="sticky-note-note:Onboarding"]',
    )!
    expect(card.style.fontSize).toContain('var(--note-scale)')
    expect(card.style.minWidth).toContain('var(--erd-note-min-w)')
    expect(card.style.maxWidth).toContain('var(--erd-note-max-w)')
  })
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm run test:run -- src/features/erd-canvas/ui/StickyNote.test.tsx`
Expected: FAIL — `data-testid`가 없어 `querySelector`가 `null`, 역참조에서 TypeError.

- [ ] **Step 3: 토큰을 정의한다**

`src/index.css`의 `--erd-note-*` 색 토큰 바로 아래(같은 `:root` 블록, 라이트 정의부)에 치수 토큰을 더한다. **다크 블록에는 넣지 않는다** — 색이 아니라 치수라 테마와 무관하다:

```css
    /* 노트 카드 기하 (ADR-0026). 카드는 명시 치수를 갖지 않고 이 값들에
       --note-scale(1~3)을 곱해 파생한다. 색이 아니라 치수라 테마 분기 없음. */
    --erd-note-min-w: 160px;
    --erd-note-max-w: 260px;
    --erd-note-pad-x: 12px;
    --erd-note-pad-y: 6px;
    --erd-note-radius: 4px;
    --erd-note-border-w: 1px;
    /* 리사이즈 핸들 변. 컨트롤이므로 배율을 곱하지 않는다(조작 표적은 일정해야 한다). */
    --erd-note-handle: 12px;
```

- [ ] **Step 4: 카드를 배율 기반으로 다시 쓴다**

`src/features/erd-canvas/ui/StickyNote.tsx` 전체를 이것으로 바꾼다:

```tsx
import { memo, type CSSProperties } from 'react'
import type { NodeProps } from '@xyflow/react'
import { clampNoteScale, type StickyNodeData } from '@/entities/erd'

export type StickyNoteProps = NodeProps & { data: StickyNodeData }

/** 배율에 비례하는 안쪽 여백 — 패딩도 카드와 같은 비율로 커진다. */
const PAD = 'calc(var(--erd-note-pad-y) * var(--note-scale)) calc(var(--erd-note-pad-x) * var(--note-scale))'

/**
 * Custom React Flow node for a standalone DBML Note: a read-only sticky card
 * showing the note title and content. No handles (notes have no relationships).
 *
 * 크기는 명시 치수가 아니라 배율 하나로 표현한다(ADR-0026): 루트에 --note-scale을
 * 걸고 모든 기하를 calc(토큰 × 배율)로 파생시키므로 실제 border-box가 배율만큼
 * 커진다 → React Flow의 measured가 정확해지고 엣지 장애물·선택 링이 따라온다.
 * (CSS transform: scale()은 border-box를 바꾸지 않아 measured가 어긋난다.)
 * features layer: depends on shared + entities/erd + @xyflow/react.
 */
function StickyNoteImpl({ id, data }: StickyNoteProps) {
  const scale = clampNoteScale(data.scale)

  return (
    <div
      data-testid={`sticky-note-${id}`}
      className="shadow-sm"
      style={
        {
          '--note-scale': String(scale),
          position: 'relative',
          minWidth: 'calc(var(--erd-note-min-w) * var(--note-scale))',
          maxWidth: 'calc(var(--erd-note-max-w) * var(--note-scale))',
          borderRadius: 'calc(var(--erd-note-radius) * var(--note-scale))',
          border: 'calc(var(--erd-note-border-w) * var(--note-scale)) solid var(--erd-note-border)',
          ...(data.headerColor ? { borderTopColor: data.headerColor } : {}),
          background: 'var(--erd-note-bg)',
          fontSize: 'calc(var(--erd-fs-sm) * var(--note-scale))',
        } as CSSProperties
      }
    >
      <div
        style={{
          borderBottom:
            'calc(var(--erd-note-border-w) * var(--note-scale)) solid var(--erd-note-head-border)',
          padding: PAD,
          fontSize: 'calc(var(--erd-fs-md) * var(--note-scale))',
          fontWeight: 600,
          color: 'var(--erd-note-head-text)',
        }}
      >
        {data.title}
      </div>
      <p
        className="whitespace-pre-wrap"
        style={{ padding: PAD, color: 'var(--erd-note-text)' }}
      >
        {data.content}
      </p>
    </div>
  )
}

export const StickyNote = memo(StickyNoteImpl)
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npm run test:run -- src/features/erd-canvas/ui/StickyNote.test.tsx`
Expected: PASS — 신규 4개 + 기존 2개(제목/본문 렌더, 핸들 0개).

- [ ] **Step 6: 배율 1이 기존과 픽셀 동일한지 실 브라우저로 확인한다**

도커 스택이 떠 있어야 한다. 임시 스펙 없이 기존 캔버스 스펙으로 회귀만 본다:

```bash
VITE_PROXY_TARGET=http://localhost:4000 npx playwright test e2e/editor-erd.spec.ts --project=chromium --reporter=line
```
Expected: PASS. 실패하면 카드 기하가 기존과 달라진 것이므로 토큰 값을 대조한다(`160/260/12/6/4/1`).

- [ ] **Step 7: 커밋**

```bash
git add src/index.css src/features/erd-canvas/ui/StickyNote.tsx \
        src/features/erd-canvas/ui/StickyNote.test.tsx
git commit -m "feat(erd): 노트 카드의 기하를 토큰×배율로 파생시킨다"
```

---

### Task 4: 리사이즈 핸들과 커밋 통로

노드는 RF 렌더러 안에 있어 props로 콜백을 받을 수 없다. `GroupActionContext`·`EdgePathContext`와 같은 통로를 신설한다.

**배율 산식 주의:** 이동량과 카드 폭을 **둘 다 화면 px**로 재면 줌이 약분된다(`dx_screen / w_screen == dx_flow / w_flow`). 스펙에 적어둔 "RF 줌으로 나눈다"는 불필요하므로 하지 않는다 — `useStore` 의존이 하나 줄어든다.

**Files:**
- Create: `src/features/erd-canvas/lib/noteScaleContext.ts`
- Modify: `src/features/erd-canvas/ui/StickyNote.tsx`
- Modify: `src/features/erd-canvas/ui/ErdCanvas.tsx`
- Modify: `src/shared/i18n/locales/ko.json`, `src/shared/i18n/locales/en.json`
- Test: `src/features/erd-canvas/ui/StickyNote.test.tsx`

**Interfaces:**
- Consumes: `clampNoteScale`/`NOTE_SCALE_MAX` (Task 2), `--erd-note-handle` (Task 3), `useCanvasReadOnly()` (기존 `../lib/canvasReadOnly`), `nodesToLayout` (Task 1)
- Produces:
  - `NoteScaleContextValue = { onNoteScale: (nodeId: string, scale: number, commit: boolean) => void }`
  - `NoteScaleContext`, `useNoteScaleContext()`
  - 핸들 `data-testid="note-resize-${id}"`
  - i18n 키 `note.resize`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/features/erd-canvas/ui/StickyNote.test.tsx` 상단 import를 보강한다:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { StickyNote, type StickyNoteProps } from './StickyNote'
import { CanvasReadOnlyContext } from '../lib/canvasReadOnly'
import { NoteScaleContext } from '../lib/noteScaleContext'
```

기존 `renderNode`는 그대로 두고, 아래 헬퍼와 describe를 파일 끝에 추가한다:

```ts
/** jsdom은 레이아웃이 없어 카드 폭이 0이다 — 배율 산식이 폭을 나누므로 고정 폭을 준다. */
function stubCardWidth(width: number) {
  const spy = vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockReturnValue({ width, height: 120, top: 0, left: 0, right: width, bottom: 120, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
  return spy
}

afterEach(() => {
  vi.restoreAllMocks()
})

function renderWithScaleCtx(
  props: StickyNoteProps,
  onNoteScale: (nodeId: string, scale: number, commit: boolean) => void,
  readOnly = false,
) {
  return render(
    <ReactFlowProvider>
      <CanvasReadOnlyContext.Provider value={readOnly}>
        <NoteScaleContext.Provider value={{ onNoteScale }}>
          <StickyNote {...props} />
        </NoteScaleContext.Provider>
      </CanvasReadOnlyContext.Provider>
    </ReactFlowProvider>,
  )
}

const noteProps = {
  ...baseProps,
  data: { title: 'Onboarding', content: 'text' },
} as StickyNoteProps

describe('StickyNote resize handle', () => {
  it('offers a handle on an editable canvas', () => {
    renderWithScaleCtx(noteProps, () => {})
    expect(screen.getByTestId('note-resize-note:Onboarding')).toBeInTheDocument()
  })

  it('renders no handle in read-only mode (ADR-0025)', () => {
    renderWithScaleCtx(noteProps, () => {}, true)
    expect(screen.queryByTestId('note-resize-note:Onboarding')).toBeNull()
  })

  it('previews while dragging and commits on release', () => {
    stubCardWidth(200)
    const calls: Array<[string, number, boolean]> = []
    renderWithScaleCtx(noteProps, (id, scale, commit) => calls.push([id, scale, commit]))
    const handle = screen.getByTestId('note-resize-note:Onboarding')

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 100 })
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 100 })

    // 폭 200px 카드에서 오른쪽으로 100px → 1 * (1 + 100/200) = 1.5
    expect(calls[0]).toEqual(['note:Onboarding', 1.5, false])
    expect(calls[calls.length - 1]).toEqual(['note:Onboarding', 1.5, true])
  })

  it('never goes below the default size when dragged left', () => {
    stubCardWidth(200)
    const calls: Array<[string, number, boolean]> = []
    renderWithScaleCtx(noteProps, (id, scale, commit) => calls.push([id, scale, commit]))
    const handle = screen.getByTestId('note-resize-note:Onboarding')

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: -400 })

    expect(calls[0][1]).toBe(1)
  })

  it('caps at the maximum scale when dragged far right', () => {
    stubCardWidth(200)
    const calls: Array<[string, number, boolean]> = []
    renderWithScaleCtx(noteProps, (id, scale, commit) => calls.push([id, scale, commit]))
    const handle = screen.getByTestId('note-resize-note:Onboarding')

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 5000 })

    expect(calls[0][1]).toBe(3)
  })

  it('resets to the default size on handle double-click', () => {
    const calls: Array<[string, number, boolean]> = []
    renderWithScaleCtx(
      { ...baseProps, data: { title: 'Onboarding', content: 'text', scale: 2.4 } } as StickyNoteProps,
      (id, scale, commit) => calls.push([id, scale, commit]),
    )
    fireEvent.doubleClick(screen.getByTestId('note-resize-note:Onboarding'))
    expect(calls).toEqual([['note:Onboarding', 1, true]])
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm run test:run -- src/features/erd-canvas/ui/StickyNote.test.tsx`
Expected: FAIL — `../lib/noteScaleContext` 모듈 없음으로 import 실패.

- [ ] **Step 3: i18n 키를 양쪽에 먼저 넣는다**

`src/shared/i18n/locales/ko.json` — 최상위 `"group"` 키 바로 뒤에 추가한다:

```json
  "note": {
    "resize": "크기 조절 — 드래그, 더블클릭하면 기본 크기"
  },
```

`src/shared/i18n/locales/en.json` — 같은 자리에:

```json
  "note": {
    "resize": "Resize — drag, double-click to reset"
  },
```

- [ ] **Step 4: 통로를 만든다**

`src/features/erd-canvas/lib/noteScaleContext.ts` (신규):

```ts
/**
 * 노트 노드 → 캔버스 액션 통로. StickyNote는 React Flow 렌더러 안에 있어 콜백을
 * context(provider의 useMemo로 안정 identity)로 받는다. groupActionContext와 동일 패턴.
 * features layer (FSD): erd-canvas 로컬.
 */
import { createContext, useContext } from 'react'

export interface NoteScaleContextValue {
  /**
   * 노트의 표시 배율을 바꾼다(ADR-0026).
   * commit=false → 드래그 중 미리보기(노드 data만), true → layout 저장까지.
   */
  onNoteScale: (nodeId: string, scale: number, commit: boolean) => void
}

const noop = () => {}
export const NoteScaleContext = createContext<NoteScaleContextValue>({
  onNoteScale: noop,
})
export function useNoteScaleContext(): NoteScaleContextValue {
  return useContext(NoteScaleContext)
}
```

- [ ] **Step 5: 핸들을 붙인다**

`src/features/erd-canvas/ui/StickyNote.tsx` — import를 보강한다:

```tsx
import { memo, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { NodeProps } from '@xyflow/react'
import { clampNoteScale, NOTE_SCALE_MIN, type StickyNodeData } from '@/entities/erd'
import { useCanvasReadOnly } from '../lib/canvasReadOnly'
import { useNoteScaleContext } from '../lib/noteScaleContext'
```

`StickyNoteImpl` 본문 시작부에 상태와 핸들러를 더한다:

```tsx
function StickyNoteImpl({ id, data }: StickyNoteProps) {
  const { t } = useTranslation()
  const scale = clampNoteScale(data.scale)
  const readOnly = useCanvasReadOnly()
  const { onNoteScale } = useNoteScaleContext()
  const cardRef = useRef<HTMLDivElement>(null)
  /** 드래그 시작 시점의 배율·포인터 X·카드 폭(화면 px). */
  const dragRef = useRef<{ s0: number; x0: number; w0: number } | null>(null)

  /** 화면 px 비율로 배율을 낸다 — dx와 폭이 같은 좌표계라 RF 줌이 약분된다. */
  const scaleAt = (clientX: number): number => {
    const d = dragRef.current!
    return clampNoteScale(d.s0 * (1 + (clientX - d.x0) / d.w0))
  }

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    // RF의 노드 드래그(카드 이동)와 분리한다 — 핸들은 이동이 아니라 확대다.
    e.stopPropagation()
    const w = cardRef.current?.getBoundingClientRect().width ?? 0
    if (w <= 0) return
    dragRef.current = { s0: scale, x0: e.clientX, w0: w }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const moveResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    onNoteScale(id, scaleAt(e.clientX), false)
  }

  const endResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    const next = scaleAt(e.clientX)
    dragRef.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    // 움직이지 않은 클릭으로는 저장하지 않는다(불필요한 autosave 방지).
    if (next !== d.s0) onNoteScale(id, next, true)
  }
```

카드 루트에 `ref={cardRef}`를 더하고, 본문 `<p>` **뒤**(카드 닫는 `</div>` 앞)에 핸들을 넣는다:

```tsx
      {!readOnly && (
        <div
          data-testid={`note-resize-${id}`}
          title={t('note.resize')}
          aria-label={t('note.resize')}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onDoubleClick={(e) => {
            // 카드 더블클릭 = centerOnNode(ErdCanvas onNodeDoubleClick)이므로 반드시 막는다.
            e.stopPropagation()
            onNoteScale(id, NOTE_SCALE_MIN, true)
          }}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 'var(--erd-note-handle)',
            height: 'var(--erd-note-handle)',
            cursor: 'nwse-resize',
            // 우하단 코너를 채우는 삼각형 — 테두리 색을 그대로 쓴다(F2).
            background:
              'linear-gradient(135deg, transparent 50%, var(--erd-note-border) 50%)',
            touchAction: 'none',
          }}
        />
      )}
```

- [ ] **Step 6: 통과를 확인한다**

Run: `npm run test:run -- src/features/erd-canvas/ui/StickyNote.test.tsx`
Expected: PASS — 신규 6개 + Task 3의 4개 + 기존 2개.

> `renders no connection handles` 테스트는 `.react-flow__handle` 클래스를 세므로 새 리사이즈 핸들과 무관하다(클래스가 다름). 실패하면 핸들에 그 클래스를 실수로 붙인 것이다.

- [ ] **Step 7: 캔버스에 통로를 연결한다**

`src/features/erd-canvas/ui/ErdCanvas.tsx` — import를 더한다(기존 `groupActionContext` import 옆):

```tsx
import { NoteScaleContext, type NoteScaleContextValue } from '../lib/noteScaleContext'
```

`groupActionCtx` 선언 **바로 뒤**에 핸들러를 더한다:

```tsx
  // 노트 표시 배율(ADR-0026). 정본은 노드 data.scale이고 layout은 영속 사본이므로
  // 미리보기는 setNodes만, 커밋은 nodesToLayout까지 태운다(좌표 커밋과 같은 리듬).
  const noteScaleCtx = useMemo<NoteScaleContextValue>(
    () => ({
      onNoteScale: (nodeId, scale, commit) => {
        if (readOnlyRef.current) return
        const next = nodesRef.current.map((n) =>
          n.id === nodeId && n.type === 'sticky'
            ? { ...n, data: { ...n.data, scale } }
            : n,
        )
        setNodes(next)
        if (commit) onLayoutChange?.(nodesToLayout(next))
      },
    }),
    [onLayoutChange, setNodes],
  )
```

provider를 `GroupActionContext.Provider` 안쪽에 감싼다:

```tsx
    <GroupActionContext.Provider value={groupActionCtx}>
    <NoteScaleContext.Provider value={noteScaleCtx}>
    <EdgeRoutesProvider>
```

닫는 쪽도 짝을 맞춘다(`</GroupActionContext.Provider>` 앞):

```tsx
    </NoteScaleContext.Provider>
    </GroupActionContext.Provider>
```

- [ ] **Step 8: 전체 단위 테스트 + 타입 체크**

```bash
npm run test:run
rm -f node_modules/.tmp/tsconfig.app.tsbuildinfo
npx tsc -p tsconfig.app.json --noEmit
```
Expected: 단위 테스트 전부 PASS. 타입은 사전 존재 3건만.

- [ ] **Step 9: 커밋**

```bash
git add src/features/erd-canvas/lib/noteScaleContext.ts \
        src/features/erd-canvas/ui/StickyNote.tsx \
        src/features/erd-canvas/ui/StickyNote.test.tsx \
        src/features/erd-canvas/ui/ErdCanvas.tsx \
        src/shared/i18n/locales/ko.json src/shared/i18n/locales/en.json
git commit -m "feat(erd): 노트 우하단을 끌어 키운다 — 배율은 layout에 남는다"
```

---

### Task 5: 실 브라우저 검증 (E2E)

시각/포인터/z-index 문제는 추측하지 않고 브라우저로 측정한다(frontend.md). 특히 핸들 `pointerdown`이 RF 노드 드래그와 경합하지 않는지, 새로고침 후 배율이 살아남는지가 이 태스크의 존재 이유다.

**Files:**
- Create: `frontend/e2e/note-scale.spec.ts`

**Interfaces:**
- Consumes: `note-resize-${id}`·`sticky-note-${id}` testid (Task 3·4), `StoredPosition.scale` (Task 1), `enterEditMode` (`./helpers`)
- Produces: 없음 (검증 전용)

- [ ] **Step 1: 스택이 떠 있는지 확인한다**

```bash
docker compose -p codegram ps
```
Expected: backend·frontend·postgres가 up. 아니면 `deploy/scripts/start.sh`로 띄운다.

- [ ] **Step 2: 스펙을 쓴다**

`frontend/e2e/note-scale.spec.ts` (신규):

```ts
// frontend/e2e/note-scale.spec.ts
import { test, expect, type Page } from '@playwright/test'
import { enterEditMode } from './helpers'

const PASSWORD = 'password123'
const NOTE_ID = 'note:history'

/** closeBrackets:false 이므로 따옴표를 그대로 타이핑해도 안전하다(DbmlEditor.tsx:59). */
const DBML = `Table users {
  id int [pk]
}

Note history {
  'memo line'
}
`

async function registerAndLogin(page: Page, email: string) {
  await page.goto('/register')
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill(PASSWORD)
  await page.locator('#register-confirm-password').fill(PASSWORD)
  const loginResponse = page.waitForResponse(
    (resp) => resp.url().includes('/api/auth/jwt/login') && resp.status() === 204,
  )
  await page.getByRole('button', { name: '회원가입' }).click()
  await loginResponse
  await page.waitForURL((url) => url.pathname === '/')
}

async function createProjectAndOpen(page: Page, name: string): Promise<string> {
  const createResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/projects') &&
      resp.request().method() === 'POST' &&
      resp.status() === 201,
  )
  await page.getByPlaceholder('프로젝트 이름').fill(name)
  await page.getByRole('button', { name: '만들기' }).click()
  const created = await (await createResponse).json()
  const projectId = created.id as string
  await page.waitForURL((url) => url.pathname === `/editor/${projectId}`)
  await enterEditMode(page)
  return projectId
}

async function typeDbml(page: Page, dbml: string) {
  const editor = page.getByTestId('dbml-editor')
  await editor.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Delete')
  await page.keyboard.type(dbml)
}

/** Drag the note's corner handle horizontally by dx screen px. */
async function dragHandle(page: Page, dx: number) {
  const handle = page.getByTestId(`note-resize-${NOTE_ID}`)
  const box = (await handle.boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + dx, cy, { steps: 10 })
  await page.mouse.up()
}

async function noteWidth(page: Page): Promise<number> {
  const box = (await page.getByTestId(`sticky-note-${NOTE_ID}`).boundingBox())!
  return box.width
}

test.describe('note display scale (ADR-0026)', () => {
  test('drag grows the note, and the scale survives a reload', async ({ page }) => {
    await registerAndLogin(page, `note-scale-${Date.now()}@example.com`)
    const projectId = await createProjectAndOpen(page, 'note scale')
    await typeDbml(page, DBML)

    const card = page.getByTestId(`sticky-note-${NOTE_ID}`)
    await expect(card).toBeVisible({ timeout: 20000 })
    const before = await noteWidth(page)
    const cardBefore = (await card.boundingBox())!

    const patch = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/projects/${projectId}`) &&
        r.request().method() === 'PATCH' &&
        r.status() === 200,
    )
    await dragHandle(page, 120)

    // 카드가 실제로 커졌다 (transform이 아니라 레이아웃이 커진 것 — border-box 기준).
    const after = await noteWidth(page)
    expect(after).toBeGreaterThan(before + 20)

    // 핸들 드래그가 카드를 이동시키지 않았다 (RF 노드 드래그와 분리됨).
    const cardAfter = (await card.boundingBox())!
    expect(Math.abs(cardAfter.x - cardBefore.x)).toBeLessThan(2)
    expect(Math.abs(cardAfter.y - cardBefore.y)).toBeLessThan(2)

    // layout에 배율이 실려 저장됐다.
    const body = (await patch).request().postDataJSON() as {
      layout?: { positions: Record<string, { scale?: number }> }
    }
    expect(body.layout?.positions[NOTE_ID]?.scale).toBeGreaterThan(1)

    // 새로고침 후에도 큰 상태다.
    await page.reload()
    await expect(card).toBeVisible({ timeout: 20000 })
    expect(await noteWidth(page)).toBeGreaterThan(before + 20)
  })

  test('double-clicking the handle restores the default size', async ({ page }) => {
    await registerAndLogin(page, `note-reset-${Date.now()}@example.com`)
    await createProjectAndOpen(page, 'note reset')
    await typeDbml(page, DBML)

    await expect(page.getByTestId(`sticky-note-${NOTE_ID}`)).toBeVisible({ timeout: 20000 })
    const before = await noteWidth(page)

    await dragHandle(page, 120)
    expect(await noteWidth(page)).toBeGreaterThan(before + 20)

    await page.getByTestId(`note-resize-${NOTE_ID}`).dblclick()
    expect(await noteWidth(page)).toBeCloseTo(before, 0)
  })

  test('the maximum scale caps growth', async ({ page }) => {
    await registerAndLogin(page, `note-cap-${Date.now()}@example.com`)
    await createProjectAndOpen(page, 'note cap')
    await typeDbml(page, DBML)

    await expect(page.getByTestId(`sticky-note-${NOTE_ID}`)).toBeVisible({ timeout: 20000 })
    const before = await noteWidth(page)

    await dragHandle(page, 3000)
    const capped = await noteWidth(page)
    await dragHandle(page, 3000)
    expect(await noteWidth(page)).toBeCloseTo(capped, 0)
    // 상한 3배 — 캔버스 줌이 1이면 폭도 약 3배다.
    expect(capped).toBeLessThan(before * 3.2)
  })

  test('read-only canvas offers no resize handle', async ({ page }) => {
    await registerAndLogin(page, `note-ro-${Date.now()}@example.com`)
    const projectId = await createProjectAndOpen(page, 'note read-only')
    await typeDbml(page, DBML)
    await expect(page.getByTestId(`sticky-note-${NOTE_ID}`)).toBeVisible({ timeout: 20000 })

    // 편집 모드에서 나가 읽기 전용으로 되돌린다 (ADR-0025).
    await page.getByTestId('mode-switch-read').click()
    await page.goto(`/editor/${projectId}`)
    await expect(page.getByTestId(`sticky-note-${NOTE_ID}`)).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId(`note-resize-${NOTE_ID}`)).toHaveCount(0)
  })
})
```

> testid `mode-switch-read`/`mode-switch-edit`는 `features/edit-lock/ui/LockStatusControl`의 것이며 실재를 확인했다.

- [ ] **Step 3: 실행한다**

```bash
VITE_PROXY_TARGET=http://localhost:4000 npx playwright test e2e/note-scale.spec.ts --project=chromium --reporter=line
```
Expected: 4 passed.

실패 시 추측하지 말고 프로브로 원인을 확정한다(frontend.md):
- 핸들이 안 잡힌다 → `elementFromPoint(cx, cy)`로 무엇이 위에 있는지 본다(카드 z-index / 엣지 레이어).
- 카드가 따라 움직인다 → `startResize`의 `stopPropagation` 누락 또는 RF가 `pointerdown`을 캡처 단계에서 먹는 것. 후자면 핸들에 `onPointerDownCapture`로 옮긴다.
- 폭이 안 변한다 → `--note-scale`이 실제로 바뀌는지 `getComputedStyle(card).getPropertyValue('--note-scale')`로 본다.

- [ ] **Step 4: 회귀 확인**

```bash
VITE_PROXY_TARGET=http://localhost:4000 npx playwright test e2e/editor-erd.spec.ts e2e/editor-layout.spec.ts --project=chromium --reporter=line
```
Expected: PASS. 실패하면 사전 존재 실패인지 `git stash`로 대조해 구분한다(G4).

- [ ] **Step 5: 커밋**

```bash
git add e2e/note-scale.spec.ts
git commit -m "test(e2e): 노트 배율을 실 브라우저에서 잰다"
```

---

## Self-Review

**Spec coverage** — 스펙의 각 절이 어느 태스크에서 구현되는지:

| 스펙 절 | 태스크 |
|---|---|
| 데이터 흐름 (layout ↔ data.scale 왕복) | Task 1 |
| 크기 표현 — 기하 토큰 6개 + 폰트 토큰×배율 | Task 3 (+ `--erd-note-border-w` 1개 추가 → 총 7개) |
| 조작 — 핸들·산식·커밋·리셋·포인터 캡처 | Task 4 |
| 통로 (NoteScaleContext) | Task 4 |
| 변경 파일 표 9개 | Task 1(3) · 2(2) · 3(2) · 4(4) — 전부 포함 |
| 부수 효과: 엣지 라우팅 무변경 | 코드 변경 없음, Task 5 회귀로 확인 |
| 부수 효과: auto-arrange 배율 보존 | Task 2 Step 1 |
| 테스트 1~6 (단위) | Task 1(1·2·3) · 2(4·6) · 3(5) · 4(5) |
| 테스트 7~10 (E2E) | Task 5 |

**스펙과 달라진 점 2건** (구현 중 발견 — 계획이 정본):
1. 스펙은 배율 산식에서 RF 줌으로 나누라고 했으나, 이동량과 카드 폭을 **둘 다 화면 px**로 재면 줌이 약분된다. `useStore` 의존을 없앤다(Task 4).
2. 토큰이 6개가 아니라 **7개**다 — ADR이 "테두리도 같은 비율"이라 했으므로 `--erd-note-border-w`가 필요하다(Task 3).

**Placeholder scan:** 통과. 모든 코드 단계에 실제 코드가 들어 있고 "적절히 처리"·"엣지 케이스 처리" 류 표현 없음.

**Type consistency:** `clampNoteScale`·`NOTE_SCALE_MIN`·`NOTE_SCALE_MAX`(Task 2 정의 → 3·4 사용), `NoteScaleContextValue.onNoteScale(nodeId, scale, commit)`(Task 4 정의 → 같은 태스크 내 소비), `StoredPosition.scale`·`StickyNodeData.scale`(Task 1 정의 → 2·3 사용), testid `sticky-note-${id}`·`note-resize-${id}`(Task 3·4 정의 → 5 사용) — 전부 일치.
