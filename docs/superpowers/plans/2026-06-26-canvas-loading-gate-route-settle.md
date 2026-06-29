# ERD 로딩 게이트: 라우팅 settle까지 오버레이 유지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트를 열 때 "ERD 불러오는 중" 오버레이가 **캔버스가 실제로 다 그려진(노드 measured + 엣지 라우팅 settle + fitView 완료) 뒤에** 사라지게 하여, 로딩 직후 캔버스가 한 번 더 다시 그려지는 현상을 사용자 눈에서 숨긴다.

**Architecture:** 현재 오버레이(`canvas-loading-overlay`)는 `position:absolute`로 캔버스를 **덮기만** 하고 캔버스는 그 아래에서 정상적으로 마운트·측정·재라우팅된다. 따라서 "가려진 채 재그림을 끝낸 뒤 오버레이를 제거"하면 된다. `ErdCanvasInner`가 React Flow store에서 "모든 카드 measured" 전이를 감지해, 라우팅(merge/spread)이 measured 기반으로 반영되는 다음 프레임(rAF×2)까지 기다린 뒤 명령형 `fitView` + 신규 `onCanvasReady()` 콜백을 **1회** 발화한다. editor 페이지는 기존 파싱-settle 게이트(`readyProjectId`)에 더해 이 캔버스-settle 게이트(`canvasReadyId`)를 AND로 결합한다. 프로젝트 전환 시에만 재발화하도록 `<ErdCanvas key={project.id}>`로 서브트리를 리마운트한다.

**Tech Stack:** React 19 + TypeScript, @xyflow/react (React Flow v12, `useStore`/`useReactFlow`), Vitest(jsdom) 단위 테스트, Playwright E2E(실 브라우저, 측정/라우팅이 실제로 일어나는 유일한 환경).

## Global Constraints

- **i18n (F4):** 사용자 노출 문자열은 `t('key')`로만. 본 작업은 새 문자열을 추가하지 않는다(기존 `editor.loadingErd` 재사용).
- **FSD 경계 (F3):** `features/erd-canvas` → `pages/editor` 방향만. ErdCanvas는 페이지를 import하지 않는다. 신호는 `onCanvasReady?: () => void` 콜백 prop으로 위로 올린다.
- **단일 출처 (G1) / 외과적 변경 (G2):** 측정 판정은 순수 함수 한 곳(`allCardsMeasured`)에서만. 요청에 직결되는 라인만 바꾸고 인접 코드/포맷을 건드리지 않는다.
- **검증 (G3):** 타입 `cd frontend && npm run type-check`, 단위 `cd frontend && npm run test:run`, E2E는 도커 스택이 떠 있을 때 호스트에서 `cd frontend && VITE_PROXY_TARGET=http://localhost:4000 npx playwright test <spec> --project=chromium --reporter=line`.
- **사전이슈 구분 (G4):** 기존 테스트 실패는 `git stash`로 main과 대조해 회귀인지 확인하고, 사전 존재면 그렇게 명시한다.

---

## File Structure

- `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx` — (1) `ErdCanvasProps`에 `onCanvasReady?: () => void` 추가, (2) 모듈 스코프 순수 함수 `allCardsMeasured()` 추가(+export, 테스트용), (3) `ErdCanvasInner`에 measured-settle 감지 effect + 명령형 fitView + 신호 발화.
- `frontend/src/features/erd-canvas/ui/ErdCanvas.measured.test.tsx` — `allCardsMeasured()` 순수 함수 단위 테스트(신규).
- `frontend/src/pages/editor/index.tsx` — `canvasReadyId` 상태 + `handleCanvasReady` 콜백, 전환 시 리셋, 게이트(`canvasLoading`) 결합, `<ErdCanvas key={...} onCanvasReady={...}>` 배선.
- `frontend/e2e/canvas-loading-settle.spec.ts` — 오버레이가 사라지는 순간 캔버스가 이미 최종 상태(직후 프레임에 엣지 경로가 바뀌지 않음)임을 프로브로 검증(신규).

각 파일은 한 가지 책임만 진다: ErdCanvas는 "캔버스가 안정됐다"는 신호 생성, editor는 그 신호로 오버레이 닫기 결정, E2E는 사용자 관점의 무-재그림 검증.

---

## Task 1: ErdCanvas — measured 판정 순수 함수 + settle 신호

**Files:**
- Modify: `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx` (props 정의 `:64-102`, 모듈 스코프 헬퍼, `ErdCanvasInner` `:305` 본문)
- Test: `frontend/src/features/erd-canvas/ui/ErdCanvas.measured.test.tsx` (신규)

**Interfaces:**
- Produces:
  - `export function allCardsMeasured(cards: { type?: string; measured?: { width?: number; height?: number } | null }[]): boolean` — table/enum 카드가 하나 이상 있고 그 전부가 measured(width·height 모두 non-null)면 `true`, 카드가 0개거나 하나라도 미측정이면 `false`.
  - `ErdCanvasProps.onCanvasReady?: () => void` — 프로젝트(캔버스 인스턴스) 마운트당 **정확히 1회**, 모든 카드 measured + 라우팅 반영 프레임 경과 + 명령형 fitView 직후 발화.

- [ ] **Step 1: `allCardsMeasured` 실패 테스트 작성**

`frontend/src/features/erd-canvas/ui/ErdCanvas.measured.test.tsx` 생성:

```tsx
import { describe, expect, it } from 'vitest'
import { allCardsMeasured } from './ErdCanvas'

describe('allCardsMeasured', () => {
  it('카드가 0개면 false (아직 그릴 게 없음/시드 전)', () => {
    expect(allCardsMeasured([])).toBe(false)
    expect(allCardsMeasured([{ type: 'group', measured: { width: 100, height: 80 } }])).toBe(false)
  })

  it('table/enum이 전부 measured면 true', () => {
    expect(
      allCardsMeasured([
        { type: 'table', measured: { width: 240, height: 120 } },
        { type: 'enum', measured: { width: 160, height: 60 } },
        { type: 'group', measured: null }, // group은 판정 제외
      ]),
    ).toBe(true)
  })

  it('table/enum 중 하나라도 미측정이면 false', () => {
    expect(
      allCardsMeasured([
        { type: 'table', measured: { width: 240, height: 120 } },
        { type: 'table', measured: null },
      ]),
    ).toBe(false)
    expect(
      allCardsMeasured([{ type: 'table', measured: { width: 240 } }]),
    ).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd frontend && npx vitest run src/features/erd-canvas/ui/ErdCanvas.measured.test.tsx`
Expected: FAIL — `allCardsMeasured` is not exported / not a function.

- [ ] **Step 3: `allCardsMeasured` 구현 (모듈 스코프, `schemaSignature` 근처에 추가)**

`ErdCanvas.tsx`의 `schemaSignature` 함수(`:126-128`) 바로 아래에 추가:

```tsx
/**
 * 캔버스 로딩 게이트용 측정 판정: table/enum 카드가 하나 이상 있고 그 전부가
 * measured(브라우저가 실제 크기를 채움)면 true. 카드가 0개(시드 전)거나 하나라도
 * 미측정이면 false. group 박스는 measured가 비는 경우가 있어 판정에서 제외한다
 * (packGroupedLayout이 style width/height로 크기를 주므로 라우팅엔 충분).
 */
export function allCardsMeasured(
  cards: { type?: string; measured?: { width?: number; height?: number } | null }[],
): boolean {
  let any = false
  for (const n of cards) {
    if (n.type !== 'table' && n.type !== 'enum') continue
    any = true
    if (n.measured?.width == null || n.measured?.height == null) return false
  }
  return any
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && npx vitest run src/features/erd-canvas/ui/ErdCanvas.measured.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: `ErdCanvasProps`에 `onCanvasReady` prop 추가**

`ErdCanvas.tsx` `:81`의 `onCaptureReady` prop 정의 바로 아래에 추가:

```tsx
  /**
   * Fired ONCE per canvas instance after EVERY relevant card has been measured
   * and the measured-based edge routing (merge/spread) has had a frame to settle
   * — i.e. the canvas will not visibly re-draw after this. pages/editor keeps the
   * project-load overlay up until this fires so the user never sees the reflow.
   */
  onCanvasReady?: () => void
```

- [ ] **Step 6: `ErdCanvasInner` 시그니처/래퍼에 `onCanvasReady` 배선**

`ErdCanvasInner`의 구조분해(`:305`)에 `onCanvasReady`를 추가:

```tsx
function ErdCanvasInner({ schema, savedPositions, edgePaths, onEdgePathsChange, onLayoutChange, onCaptureReady, onCanvasReady, containerRef, selection, onSelect, onSelectionInfo, searchHighlightColIds, readOnly }: ErdCanvasInnerProps) {
```

그리고 외부 래퍼 `ErdCanvasComponent`(`:842`)의 구조분해와 `<ErdCanvasInner .../>`(`:878-891`) 전달에도 `onCanvasReady`를 추가한다:

```tsx
function ErdCanvasComponent({ schema, savedPositions, edgePaths, onEdgePathsChange, onLayoutChange, onCaptureReady, onCanvasReady, selection, onSelect, onSelectionInfo, searchHighlightColIds, readOnly }: ErdCanvasProps) {
```

```tsx
        <ErdCanvasInner
          schema={schema}
          savedPositions={savedPositions}
          edgePaths={edgePaths}
          onEdgePathsChange={onEdgePathsChange}
          onLayoutChange={onLayoutChange}
          onCaptureReady={onCaptureReady}
          onCanvasReady={onCanvasReady}
          containerRef={rootRef}
          selection={selection}
          onSelect={onSelect}
          onSelectionInfo={onSelectionInfo}
          searchHighlightColIds={searchHighlightColIds}
          readOnly={readOnly}
        />
```

- [ ] **Step 7: settle 감지 effect 추가 (`ErdCanvasInner` 내부)**

`ErdCanvasInner`에서 `const rf = useReactFlow()` / `const { fitView } = rf`(`:462-463`) 아래에 추가. (`useStore`는 이미 import되어 있다 — `RelationEdge`/`edgeRoutesContext`가 쓰지만 `ErdCanvas.tsx`에는 없을 수 있으니 import를 확인하고 없으면 `@xyflow/react`에서 `useStore`를 추가한다.)

```tsx
  // 캔버스 로딩 게이트 신호: 모든 카드가 measured되면(=React Flow가 실제 크기를
  // 채움), measured 기반 라우팅(merge/spread)이 반영되는 다음 프레임까지 기다린 뒤
  // 최종 뷰로 fit하고 onCanvasReady를 1회 발화한다. 이 인스턴스 생명주기 동안 1회만
  // (firedRef). 프로젝트 전환은 pages/editor가 key로 리마운트하므로 자연히 재발화된다.
  const cardsMeasured = useStore((s) => allCardsMeasured([...s.nodeLookup.values()]))
  const canvasReadyFiredRef = useRef(false)
  useEffect(() => {
    if (canvasReadyFiredRef.current || !cardsMeasured) return
    canvasReadyFiredRef.current = true
    let r2 = 0
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => {
        fitView({ padding: 0.1 })
        onCanvasReady?.()
      })
    })
    return () => {
      cancelAnimationFrame(r1)
      if (r2) cancelAnimationFrame(r2)
    }
  }, [cardsMeasured, fitView, onCanvasReady])
```

`@xyflow/react` import에 `useStore`가 없다면 추가:

```tsx
import { ReactFlow, ReactFlowProvider, Panel, useReactFlow, useNodesState, useStore, /* ...기존... */ } from '@xyflow/react'
```

- [ ] **Step 8: 타입 체크 + 전체 단위 테스트**

Run: `cd frontend && npm run type-check && npm run test:run`
Expected: 타입 PASS. 기존 `ErdCanvas.test.tsx` / `ErdCanvas.capture.test.tsx` 가 새 prop으로 깨지지 않아야 한다(선택적 prop이라 호출부 변경 불필요). 실패 시 회귀 여부를 G4대로 확인.

- [ ] **Step 9: 커밋**

```bash
git add frontend/src/features/erd-canvas/ui/ErdCanvas.tsx frontend/src/features/erd-canvas/ui/ErdCanvas.measured.test.tsx
git commit -m "feat(erd-canvas): emit onCanvasReady after cards measured + route settle"
```

---

## Task 2: editor — 캔버스-settle 게이트 결합

**Files:**
- Modify: `frontend/src/pages/editor/index.tsx` (게이트 상태/effect `:323-348`, 캔버스 배선 `:662-673`)

**Interfaces:**
- Consumes: `ErdCanvasProps.onCanvasReady`(Task 1), `schema = parse.schema ?? parse.lastValidSchema`(`:186`), `project`(`:129`).
- Produces: (페이지 내부 상태) `canvasReadyId`, `handleCanvasReady`. 외부 인터페이스 변화 없음.

- [ ] **Step 1: `canvasReadyId` 상태 + 전환 리셋 추가**

`:323`의 `const [readyProjectId, setReadyProjectId] = useState<string | null>(null)` 아래에 추가:

```tsx
  // 캔버스가 "다 그려졌다"(모든 카드 measured + 라우팅 settle)는 ErdCanvas 신호를
  // 받은 프로젝트 id. readyProjectId(파싱 settle)와 AND되어 오버레이를 닫는다.
  const [canvasReadyId, setCanvasReadyId] = useState<string | null>(null)
  // onCanvasReady는 ErdCanvas가 1회성으로 부른다 — 최신 project.id를 ref로 읽어
  // 콜백 identity를 안정시킨다(불필요한 캔버스 재렌더 방지).
  const projectIdRef = useRef<string | undefined>(undefined)
  projectIdRef.current = project?.id
  const handleCanvasReady = useCallback(() => {
    if (projectIdRef.current) setCanvasReadyId(projectIdRef.current)
  }, [])
```

`:327-335`의 전환 리셋 effect에 `setCanvasReadyId(null)`를 추가:

```tsx
  useEffect(() => {
    if (project) {
      setDbmlText(project.dbml_text)
      setBaseline(project.dbml_text)
    }
    setActivePanel(null)
    setPreviewId(null)
    setReadyProjectId(null) // 전환 시 캔버스를 다시 로딩 게이트로
    setCanvasReadyId(null)
  }, [project?.id])
```

- [ ] **Step 2: 게이트(`canvasLoading`) 결합**

`:348`의 `const canvasLoading = !project || readyProjectId !== project.id`를 교체:

```tsx
  // 그릴 게 있는 캔버스만 measured/라우팅 settle을 기다린다. 빈 스키마(테이블 0개)는
  // ErdCanvas가 ErdCanvasInner를 마운트하지 않아 onCanvasReady가 오지 않으므로,
  // 이 경우엔 캔버스 게이트를 즉시 통과시킨다(파싱 settle만으로 충분).
  const hasDrawableCanvas = !!schema && schema.tables.length > 0
  const canvasLoading =
    !project ||
    readyProjectId !== project.id ||
    (hasDrawableCanvas && canvasReadyId !== project.id)
```

- [ ] **Step 3: `<ErdCanvas>`에 key + onCanvasReady 배선**

`:662-673`의 `<ErdCanvas ...>`에 `key`와 `onCanvasReady`를 추가한다. `key={project.id}`로 프로젝트 전환 시 서브트리를 리마운트해 settle 신호가 전환마다 정확히 1회 뜨게 하고, 같은 프로젝트 내 편집에선 인스턴스를 유지해 재발화/뷰 튐을 막는다:

```tsx
          <ErdCanvas
            key={project.id}
            schema={schema}
            savedPositions={positions}
            edgePaths={edgePaths}
            onLayoutChange={handleLayoutChange}
            onEdgePathsChange={setEdgePaths}
            onCaptureReady={handleCaptureReady}
            onCanvasReady={handleCanvasReady}
            selection={selection}
            onSelect={handleCanvasSelect}
            onSelectionInfo={setSelectionInfo}
            searchHighlightColIds={searchHighlightColIds}
          />
```

> 주의: 이 블록은 `if (isLoading)`(`:363`)/`if (isError || !project)`(`:371`) early-return 뒤에서 렌더되므로 `project`는 non-null이다. `project.id`를 그대로 key로 쓸 수 있다.

- [ ] **Step 4: 타입 체크 + 단위 테스트**

Run: `cd frontend && npm run type-check && npm run test:run`
Expected: PASS. editor 페이지 테스트가 있으면 새 게이트로 깨지지 않는지 확인(오버레이는 측정 신호 없이는 jsdom에서 닫히지 않을 수 있음 — 해당 테스트가 오버레이 닫힘에 의존하면 Task 3의 E2E로 검증하도록 두고, 단위 테스트는 `onCanvasReady` 호출을 모킹). 회귀면 G4대로 보고.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/pages/editor/index.tsx
git commit -m "feat(editor): hold loading overlay until canvas route-settle"
```

---

## Task 3: E2E — 오버레이 제거 시점에 캔버스가 최종 상태임을 검증

**Files:**
- Test: `frontend/e2e/canvas-loading-settle.spec.ts` (신규)

**Interfaces:**
- Consumes: `data-testid="canvas-loading-overlay"`(`index.tsx:679`), `.react-flow__edge path`(React Flow 렌더 엣지), 프로젝트 목록/열기 흐름(기존 E2E spec의 네비게이션 패턴 재사용).

- [ ] **Step 1: 기존 E2E 네비게이션 패턴 확인**

Run: `cd frontend && ls e2e && sed -n '1,40p' e2e/snapshot.spec.ts`
목적: 프로젝트를 생성/여는 헬퍼와 baseURL·셀렉터 관례를 그대로 따른다(중복 구현 금지, G1). 시드 프로젝트가 있으면 그 열기 흐름을 사용한다.

- [ ] **Step 2: settle 검증 테스트 작성**

`frontend/e2e/canvas-loading-settle.spec.ts` 생성. 핵심 단언: **오버레이가 사라진 직후 캔버스의 엣지 경로(d 속성)가 다음 프레임들에서 바뀌지 않는다**(= 사용자가 보는 재그림 없음). 아래 네비게이션 부분은 Step 1에서 확인한 기존 spec의 헬퍼/셀렉터로 교체한다.

```ts
import { test, expect } from '@playwright/test'

test('로딩 오버레이는 캔버스 라우팅이 settle된 뒤에 사라진다(재그림 없음)', async ({ page }) => {
  // (Step 1에서 확인한 기존 패턴으로 교체) 엣지가 여러 개인 프로젝트를 연다.
  await page.goto('/')
  await page.getByTestId(/project-card/).first().click()

  // 오버레이가 일단 떠야 한다(데이터/파싱 로딩 구간).
  const overlay = page.getByTestId('canvas-loading-overlay')
  // 오버레이가 사라질 때까지 대기.
  await overlay.waitFor({ state: 'detached', timeout: 15_000 })

  // 사라진 "직후"의 엣지 경로 스냅샷.
  const edgePaths = () =>
    page.$$eval('.react-flow__edge path', (ps) => ps.map((p) => p.getAttribute('d') ?? ''))
  const before = await edgePaths()
  expect(before.length).toBeGreaterThan(0) // 엣지가 그려져 있어야 의미가 있다

  // 두 애니메이션 프레임을 흘려보낸다 — settle이 끝났다면 경로는 그대로여야 한다.
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  )
  const after = await edgePaths()

  expect(after).toEqual(before) // 오버레이 제거 후 재라우팅(재그림)이 없어야 한다
})
```

- [ ] **Step 3: 도커 스택을 띄우고 E2E 실행**

Run:
```bash
docker compose -p codegram up -d
cd frontend && VITE_PROXY_TARGET=http://localhost:4000 npx playwright test canvas-loading-settle --project=chromium --reporter=line
```
Expected: PASS — `after`가 `before`와 동일(오버레이가 settle 후 닫혀 재그림이 없음). 만약 실패(경로가 변함)하면 Task 1의 rAF 대기를 2→3프레임으로 올리거나, settle 조건에 그룹 박스 measured까지 포함할지 재검토(설계 노트 참조).

- [ ] **Step 4: 회귀 확인 — main과의 대조(선택)**

이 테스트를 변경 전 상태(`git stash`)에서 돌리면 `after !== before`(재그림 발생)로 **실패**해야 한다 = 테스트가 현상을 실제로 잡고 있음을 증명. 확인 후 `git stash pop`.

- [ ] **Step 5: 커밋**

```bash
git add frontend/e2e/canvas-loading-settle.spec.ts
git commit -m "test(e2e): overlay closes only after canvas route-settle (no reflow)"
```

---

## 설계 노트 / 리스크 (실행자 필독)

- **왜 rAF×2인가:** measured가 채워지면 `nodeLookup`이 바뀌고, 그 변화가 `RelationEdge.orthoPoints` 재계산 → `EdgeRoutesProvider.register` → rAF 1프레임 뒤 `adjusted`(merge/spread) 재계산으로 이어진다(`edgeRoutesContext.tsx:120-165`의 rAF coalescing). 따라서 measured 직후 1프레임으로는 spread가 아직 안 붙은 raw 경로가 보일 수 있어 한 프레임 더 기다린다. E2E(Task 3)에서 안 맞으면 3프레임으로 상향.
- **프레임워크 한계:** React Flow의 "측정 전→후 재계산" 자체는 없앨 수 없다. 본 작업은 그 과정을 오버레이 뒤로 **숨기는 것**이라, 체감 로딩이 측정+라우팅 시간만큼 살짝 늘어난다(대신 깜빡임 제거). 이는 의도된 트레이드오프다.
- **`key={project.id}` 리마운트 비용:** 프로젝트 전환은 드문 이벤트라 ReactFlow 서브트리 리마운트를 허용한다. 같은 프로젝트 내 편집은 key가 동일해 인스턴스가 유지되므로 settle 신호도 재발화되지 않고 fitView도 다시 돌지 않는다(편집 중 뷰 튐 없음).
- **빈/테이블0 스키마:** `ErdCanvasComponent`가 `ErdCanvasInner`를 마운트하지 않으므로 `onCanvasReady`가 오지 않는다 → editor 게이트의 `hasDrawableCanvas` 분기가 즉시 통과시킨다. 이 경로를 ErdCanvas에서 별도로 신호하지 않는다(외과적 변경: 빈 분기 div를 안 건드림).
- **jsdom 한계:** 단위 테스트에서 React Flow는 노드를 실제로 측정하지 않아 `measured`가 비어 settle이 안 뜬다. 그래서 settle/오버레이 닫힘의 진짜 검증은 Task 3의 E2E가 담당한다. 단위 테스트는 순수 함수(`allCardsMeasured`)와 콜백 배선까지만 커버한다.

## Self-Review 결과

- **Spec 커버리지:** (a) 원인=게이트 신호 분리 → Task 2가 캔버스-settle 게이트 결합으로 해소. (b) 신호 생성 → Task 1. (c) 사용자 관점 무-재그림 증명 → Task 3. 누락 없음.
- **Placeholder 스캔:** 모든 코드/명령/기대출력이 구체값. E2E 네비게이션만 "기존 패턴으로 교체"로 두었으나 Step 1에서 그 패턴을 먼저 확인하게 강제(프로젝트별 시드/셀렉터가 spec마다 달라 임의 고정이 오히려 위험).
- **타입 일관성:** `onCanvasReady: () => void`가 props 정의·`ErdCanvasInner`·`ErdCanvasComponent`·editor 호출부에서 동일. `allCardsMeasured`의 입력 형태(`{type, measured}`)가 React Flow `InternalNode`(`nodeLookup` 값)의 실제 필드와 일치.
