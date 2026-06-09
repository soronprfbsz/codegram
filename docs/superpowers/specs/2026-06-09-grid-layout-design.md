# 균형 그리드 자동 배치 + 드래그 정렬 스냅 설계

두 개의 독립 하위 기능. 결정: [ADR-0010](../../adr/0010-grid-packing-auto-layout.md), 관련 ADR-0003(React Flow)·ADR-0004(이름 기반 reconcile).

## 배경
현재 `autoLayout`은 dagre `rankdir:'LR'`. DB introspect 스키마는 FK가 드물어 고립 테이블이 전부 rank 0(한 열)에 세로로 쌓임 → "위아래로 긴" 배치. 해결: 그룹 없는 스키마를 **균형 그리드 패킹**으로 교체.

---

## Phase 1 — 균형 그리드 자동 배치

### 신규: `gridLayout(nodes, edges)` — `frontend/src/entities/erd/lib/gridLayout.ts` (PURE)
모든 노드를 16:10 목표 비율 그리드에 배치한 NEW 노드 배열 반환(top-left 좌표).
1. **연결성 정렬**: relation 엣지(enum-link 제외)로 무방향 인접 맵 구성. 입력 순서로 미방문 노드부터 **BFS**하며 방문 노드를 `order`에 append → 연결된 노드가 1D 순서에서 인접(고립 노드는 단독 성분).
2. **셀 크기**: `cellW = max(nodeSize(n).width)` (테이블 240). 각 노드 높이 = `nodeSize(n).height`.
3. **열 수**: `avgH = mean(heights)`. `cols = clamp(round(sqrt(N * (avgH + GAP_Y) / (cellW + GAP_X) * 1.6)), 1, N)`. (1.6 = 16:10)
4. **배치(row-major)**: `order[i]` → `row=floor(i/cols)`, `col=i%cols`.
   - `x = col * (cellW + GAP_X)` (열 왼쪽 정렬, 균일)
   - 행 높이 `rowH[r] = max height of row r의 노드들`; `rowTop[0]=0`, `rowTop[r]=rowTop[r-1]+rowH[r-1]+GAP_Y`; `y = rowTop[row]` (행 상단 정렬)
5. `GAP_X = 80`, `GAP_Y = 80` (간격 — 선이 셀 사이로 지나 best-effort 비겹침). 상수로 둠.
6. 결정적·순수. enum-link 엣지는 정렬에서 제외(타입 연관, dashed).

### 수정: `autoLayout(nodes, edges)` — dispatch
- `nodes.some(n => n.type === 'group')` → **기존 dagre-compound 경로 유지**(그룹 클러스터링·backdrop).
- 그룹 없음 → `gridLayout(nodes, edges)` 반환.
- (reconcile은 autoLayout을 베이스라인으로 호출 → 그룹 없는 스키마의 Auto-arrange·신규 프로젝트·신규 노드가 그리드. 저장 위치는 reconcile이 우선 보존. `computeSyncedPositions`의 신규-테이블 sub-layout도 그리드가 됨 — 더 컴팩트, 기존 테스트는 y 임계만 검사라 통과.)

### 테스트
- `gridLayout.test.ts`: N개 노드 → cols ≈ 16:10(가로>세로 경향), 열 x 균일(왼쪽 정렬), 행 상단 정렬(같은 row의 y 동일), 연결된 체인이 인접 셀, 겹침 없음(셀 bbox 비교), 단일/0 노드.
- `autoLayout.test.ts`: 그룹 경로 테스트 유지(dagre). 그룹 없는 테스트는 그리드 동작으로 갱신(경계/정렬 단언).

---

## Phase 2 — 드래그 정렬 가이드 + 스냅 (Phase 1과 독립)

이동 중 다른 노드와 **좌/중/우(x)·상/중/하(y) 6축** 정렬 감지 → 가이드선 표시 + 임계값 내 스냅(착 붙음). React Flow helper-lines 패턴.

### 신규: `getHelperLines(dragged, nodes, dist=6)` — `frontend/src/features/erd-canvas/lib/helperLines.ts` (PURE)
- dragged 노드의 bounds: `left=x, right=x+w, centerX=x+w/2`(상동 top/bottom/centerY).
- 다른 노드들과 비교: x축 9조합({left,centerX,right} × {left,centerX,right}), y축 9조합. 각 축에서 |차이| < dist 중 최소를 선택.
- 반환 `{ snapX?: number, snapY?: number, vertical?: number, horizontal?: number }`:
  - `snapX` = dragged 노드의 새 left x(스냅 정렬값), `vertical` = 가이드 세로선의 절대 x좌표(매칭된 위치). y도 동일(`snapY`/`horizontal`).
  - 매칭 없으면 해당 축 undefined.
- 노드 크기는 `nodeSize` 또는 측정된 `node.measured?.{width,height}` 사용(없으면 nodeSize 추정).

### 수정: `ErdCanvas.tsx`
- state `const [helperLines, setHelperLines] = useState<{vertical?:number; horizontal?:number}>({})`.
- `onNodeDrag={(_, node) => { const r = getHelperLines(node, nodesRef.current.filter(n=>n.id!==node.id)); setHelperLines({vertical:r.vertical, horizontal:r.horizontal}); if (r.snapX!==undefined || r.snapY!==undefined) setNodes(ns => ns.map(n => n.id===node.id ? {...n, position:{ x:r.snapX??n.position.x, y:r.snapY??n.position.y }} : n)) }}` — 스냅 + 가이드.
- `onNodeDragStop`: 기존 persist + `setHelperLines({})`(가이드 제거).
- 가이드 렌더: `<HelperLines vertical={helperLines.vertical} horizontal={helperLines.horizontal} />` — ReactFlow 내부, `useViewport`로 flow→screen 변환해 전체 폭/높이 선을 그림(accent 색, 얇게). (React Flow 공식 helper-lines 예제의 canvas/overlay 방식.)
- 보존: 기존 onNodeDragStop persist, displayNodes/displayEdges, 선택, capture, zoom, fitView 모두 유지. drag 중 스냅은 base `nodes` position만 갱신(positions 권위 유지) → dragStop에서 nodesToLayout persist.

### 신규: `HelperLines.tsx` — `frontend/src/features/erd-canvas/ui/HelperLines.tsx`
`useViewport()`(x,y,zoom) + 컨테이너 크기로 캔버스/SVG 전면 오버레이. `vertical`(flow x) → screen x = `vertical*zoom + viewport.x`에 세로선, `horizontal` → 가로선. accent 색(`--erd-accent`), 1px, pointer-events:none.

### 테스트
- `helperLines.test.ts`: 두 노드 left 정렬(x 차이<6) → snapX+vertical 반환; center/right·top/middle/bottom; 임계 밖이면 undefined; 자기 자신 제외.
- `ErdCanvas.wiring.test.tsx`: onNodeDrag 시 스냅 적용(가까운 정렬로 position 보정) + 가이드 상태 set; dragStop에 가이드 클리어. (React Flow 모킹 환경 한도 내에서 핸들러 로직 검증.)

---

## 보존 / 무영향
reconcile(저장 위치 우선)·그룹 backdrop·선택 동기화·sync·export·autosave 모두 그대로. Phase 1은 autoLayout만(그룹 없을 때) 교체, Phase 2는 ErdCanvas 드래그 핸들러 + 오버레이 추가.

## 범위 밖 (YAGNI)
그룹을 그리드에 통합, 장애물 회피 엣지 라우팅, ELK, 다중 노드 동시 드래그 스냅, 스냅 on/off 토글.
