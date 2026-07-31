# 캔버스 노트 크기 조절 (표시 배율) — 설계

> 날짜: 2026-07-31 · 결정 기록: [ADR-0026](../../adr/0026-note-display-scale-in-layout.md) · 관련: ADR-0004, 0012, 0020, 0025

## 목표

캔버스의 스티키 노트를 사용자가 키울 수 있게 한다. 커지면 폰트·패딩·테두리가 같은 비율로 커진다(= 카드 줌). 배율은 프로젝트 layout에 저장되어 새로고침·다른 사용자에게도 유지된다.

## 비목표

- 축소(배율 < 1.0). 하한은 현재 기본 크기다.
- 종횡비 변경. 폭은 콘텐츠가 정하고, 사용자는 배율만 바꾼다.
- 테이블·enum 노드의 크기 조절. 노트만 대상이다.
- undo. 복구 수단은 핸들 더블클릭 리셋이다.

## 데이터 흐름

```
DBML text ──parse──▶ schema.notes ──schemaToFlow──▶ sticky node { data: title, content }
                                                             │
layout.positions['note:history'].scale ──reconcileLayout─────▶ data.scale
                                                             │
                                        StickyNote 렌더 (--note-scale)
                                                             │
                    핸들 드래그 ──NoteScaleContext──▶ ErdCanvas.setNodes(data.scale)
                                                             │
                                pointerup ──▶ nodesToLayout ──▶ onLayoutChange (autosave)
```

`scale`은 **노드 `data`에 사는 게 정본**이고 layout은 그것의 영속 사본이다. `nodesToLayout`이 `data.scale`을 써 내리지 않으면 이후 아무 노드 드래그 한 번으로 배율이 소실된다 — 이 왕복이 유일한 취약점이므로 테스트로 고정한다.

## 크기 표현

노트 카드에 **명시 width/height를 주지 않는다.** 루트에 인라인 CSS 변수 `--note-scale`(기본 1)을 걸고, 모든 기하를 `calc(토큰 × var(--note-scale))`로 표현한다. 실제 border-box가 배율만큼 커지므로 React Flow의 `measured`가 정확해진다.

`src/index.css`에 노트 기하 토큰을 신규 정의한다(라이트/다크 공통 — 색이 아니라 치수라 테마 분기 없음):

| 토큰 | 값 | 대체 대상 (현재 `StickyNote.tsx`) |
|---|---|---|
| `--erd-note-min-w` | `160px` | `min-w-[160px]` |
| `--erd-note-max-w` | `260px` | `max-w-[260px]` |
| `--erd-note-pad-x` | `12px` | `px-3` |
| `--erd-note-pad-y` | `6px` | `py-1.5` |
| `--erd-note-radius` | `4px` | `rounded` |
| `--erd-note-handle` | `12px` | (신규 — 핸들 변) |

폰트는 기존 타이포 토큰에 배율만 곱한다(신규 토큰 없음, ADR-0020 유지):

- 본문: `calc(var(--erd-fs-sm) * var(--note-scale))` — 현재 `text-xs`(12px)와 동일한 기준값
- 제목: `calc(var(--erd-fs-md) * var(--note-scale))` — 현재 `text-sm`(14px)와 동일한 기준값

`em` 대신 명시적 `calc(토큰 × 배율)`을 쓰는 이유: `em`이면 `0.5em`·`1.1667em` 같은 파생 비율(매직 넘버)이 컴포넌트에 생긴다. 토큰 × 배율은 값의 출처가 `index.css` 한 곳으로 남는다(F5).

`--erd-note-handle`은 배율을 곱하지 **않는다.** 핸들은 콘텐츠가 아니라 컨트롤이므로 배율과 무관하게 일정한 조작 표적이어야 한다.

## 조작

`NodeResizer`를 쓰지 않는다. RF의 리사이저는 "노드에 명시 width/height를 쓴다"는 계약이라 위 고유크기 모델과 충돌한다(명시 폭이 이기면 글자와 박스가 따로 논다). 자체 핸들이 더 짧고 정확하다.

- **핸들**: 카드 우하단, `--erd-note-handle` 정사각. 색은 기존 `--erd-note-border` 재사용. `cursor: nwse-resize`.
- **표시 조건**: `useCanvasReadOnly()`가 false일 때만 렌더. 읽기 모드에서는 DOM에 없다(ADR-0025 · `canvasReadOnly.ts`).
- **배율 산식**: `pointerdown`에 `s0`(현재 배율)과 `w0`(카드 폭, 캔버스 좌표계)를 기록하고
  ```
  s = clamp(s0 * (1 + dx / w0), 1, 3)
  ```
  `dx`는 화면 이동량을 RF 줌으로 나눈 캔버스 좌표 이동량(`useStore(s => s.transform[2])`). 줌 상태와 무관하게 같은 손놀림 = 같은 배율 변화.
- **커밋**: `pointermove`는 미리보기(노드 data만 갱신), `pointerup`에 저장. `onNodeDragStop`이 좌표를 커밋하는 것과 같은 리듬이다.
- **리셋**: 핸들 `dblclick` → `s = 1.0` + 즉시 커밋.
- **포인터 캡처**: `setPointerCapture`로 카드 밖으로 나가도 드래그가 이어지게 하고, 핸들 위 `pointerdown`은 `stopPropagation`으로 RF의 노드 드래그(패닝/이동)와 분리한다.

## 통로 (context)

`GroupActionContext`·`EdgePathContext`와 동일 패턴으로 `src/features/erd-canvas/lib/noteScaleContext.ts`를 신설한다. 노드는 RF 렌더러 안에 있어 props로 콜백을 받을 수 없다.

```ts
export interface NoteScaleContextValue {
  /** commit=false: 드래그 중 미리보기, true: layout 저장까지. */
  onNoteScale: (nodeId: string, scale: number, commit: boolean) => void
}
```

`ErdCanvas`가 `useMemo`로 값을 만들어 provider로 내려주고, 구현은 기존 좌표 커밋 경로를 그대로 쓴다: `setNodes` → `commit`이면 `onLayoutChange?.(nodesToLayout(next))`.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/entities/layout/model/types.ts` | `StoredPosition.scale?: number` 추가 (`version: 1` 유지) |
| `src/entities/layout/lib/reconcile.ts` | `nodesToLayout`: sticky의 `data.scale`을 엔트리에 기록(1.0/undefined는 생략) · `reconcileLayout`: stored `scale`을 sticky `data.scale`로 주입 |
| `src/entities/erd/model/types.ts` | `StickyNodeData.scale?: number` |
| `src/entities/erd/lib/nodeSize.ts` | sticky를 `STICKY_WIDTH×s`, `STICKY_HEIGHT×s`로 보고 |
| `src/index.css` | 노트 기하 토큰 6개 신규 |
| `src/features/erd-canvas/lib/noteScaleContext.ts` | 신규 |
| `src/features/erd-canvas/ui/StickyNote.tsx` | `--note-scale` 기반 스타일 + 리사이즈 핸들 |
| `src/features/erd-canvas/ui/ErdCanvas.tsx` | `NoteScaleContext.Provider` + 커밋 핸들러 |
| `src/shared/i18n/locales/{ko,en}.json` | 핸들 `aria-label`/`title` 키 (F4) |

## 부수 효과 (무료로 따라오는 것)

- **엣지 라우팅**: 장애물 rect가 `n.measured`를 쓰므로(`edgeRoutesContext.tsx:104,152`) 커진 노트를 관계선이 알아서 피한다. 코드 변경 없음.
- **선택 링·정보 패널 좌표**: 노드 래퍼 기준이라 그대로 맞는다.
- **Auto-arrange**: `autoLayout`이 `data`를 보존하므로 배율이 유지된다(ADR-0026 결정대로). 테스트로 고정한다.

## 테스트

단위 (vitest):

1. `nodesToLayout`: sticky `data.scale = 1.8` → `positions['note:x'].scale === 1.8`; `scale`이 1.0이거나 없으면 엔트리에 필드 없음(저장 최소화)
2. `reconcileLayout`: stored `scale` → `data.scale` 주입; 없으면 미주입
3. 왕복: `reconcileLayout(nodesToLayout(nodes))`가 배율을 보존
4. `nodeSize`: sticky `scale = 2` → `{ width: 440, height: 240 }`
5. `StickyNote`: `data.scale`이 인라인 `--note-scale`로 반영 · 읽기 모드에서 핸들 미렌더
6. auto-arrange 경로가 배율을 보존

E2E (Playwright, 실 브라우저):

7. 편집 모드에서 핸들 드래그 → `getBoundingClientRect().width` 증가 → 새로고침 후에도 유지
8. 읽기 모드에서 핸들 없음 + 드래그해도 크기 불변
9. 핸들 더블클릭 → 기본 크기 복귀
10. 배율 3.0 상한에서 더 끌어도 안 커짐

## 검증 명령

```bash
cd frontend
rm -f node_modules/.tmp/tsconfig.app.tsbuildinfo   # 캐시가 에러를 억제한다
npx tsc -p tsconfig.app.json --noEmit               # npm run type-check는 루트 files:[]로 no-op
npm run test:run
VITE_PROXY_TARGET=http://localhost:4000 npx playwright test e2e/note-scale.spec.ts --project=chromium --reporter=line
```

타입 체크에는 사전 존재 에러 3건이 있다(내 변경과 무관 — G4대로 구분해 보고한다).

## 리스크

- **배율 왕복 소실** (중): `nodesToLayout`이 놓치면 조용히 사라진다. 테스트 1·3으로 고정.
- **핸들 pointerdown이 RF 노드 드래그와 경합** (중): `stopPropagation` + 포인터 캡처로 분리하되, 실제로 노트가 따라 움직이지 않는지 E2E 7에서 확인한다(추측하지 않고 브라우저로 측정).
- **`measured` 갱신 타이밍** (하): 폰트 확대 → 리플로우 → ResizeObserver → 장애물 rect 갱신이 한 프레임 늦을 수 있다. 엣지 경로가 한 프레임 뒤에 맞춰지는 정도이며 영속 상태에는 영향 없다.
